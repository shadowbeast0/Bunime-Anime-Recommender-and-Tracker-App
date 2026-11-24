
from __future__ import annotations

import ast
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import linear_kernel

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT.parent / "backend" / "scripts" / "anime.csv"
OUT_DIR = ROOT / "public" / "data"
MAX_TITLES = 6000
SYNOPSIS_CHARS = 420
NEIGHBOURS = 24
EXCLUDED_TYPES = {"music", "cm", "pv"}

def parse_list(value) -> list[str]:
    if value is None or (isinstance(value, float) and np.isnan(value)) or value == "":
        return []
    try:
        parsed = ast.literal_eval(str(value))
    except (SyntaxError, ValueError):
        parsed = str(value).split(",")
    if isinstance(parsed, (list, tuple, set)):
        return [str(item).strip() for item in parsed if str(item).strip()]
    return [str(parsed).strip()]

def clean_text(value) -> str:
    if not isinstance(value, str):
        return ""
    text = re.sub(r"\[Written by MAL Rewrite\]", "", value)
    text = re.sub(r"\(Source:[^)]*\)", "", text)
    return re.sub(r"\s+", " ", text).strip()

def trim(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0].rstrip(",.;:")
    return f"{cut}…"

SEQUEL_MARKERS = {
    "movie", "movies", "film", "the", "season", "seasons", "part", "cour", "ova", "oad", "ona", "special", "specials",
    "recap", "episode", "picture", "drama", "gekijouban", "shin", "zoku", "kan", "final", "chapter", "arc", "2nd", "3rd",
    "ii", "iii", "iv", "v", "vi", "x", "z", "kai", "next", "new", "returns", "after", "before", "prologue", "epilogue",
    "memory", "stampede", "gold", "strong", "red", "zero", "plus", "sp", "tv", "kara", "dai", "ni", "san",
    "gt", "super", "shippuden", "shippuuden", "brotherhood", "kanketsu", "hen", "gaiden", "specials", "ova", "picture",
}
SEPARATORS = set(":-~–—!?(/[.,'")

def norm_title(text: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).strip()

def continues_as_sequel(original: str, base_norm: str) -> bool:
    tokens = norm_title(original).split()
    base_tokens = base_norm.split()
    if len(tokens) <= len(base_tokens) or tokens[:len(base_tokens)] != base_tokens:
        return False
    following = tokens[len(base_tokens)]
    if following in SEQUEL_MARKERS or following.isdigit() or following[0].isdigit():
        return True
    consumed, index = 0, 0
    lowered = original.lower()
    while index < len(lowered) and consumed < len(base_norm.replace(" ", "")):
        if lowered[index].isalnum():
            consumed += 1
        index += 1
    rest = lowered[index:].lstrip()
    return bool(rest) and (rest[0] in SEPARATORS or not rest[0].isalnum())

def assign_franchises(catalog: list[dict]) -> None:
    parent = list(range(len(catalog)))

    def find(index: int) -> int:
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    def union(a: int, b: int) -> None:
        root_a, root_b = find(a), find(b)
        if root_a != root_b:
            parent[max(root_a, root_b)] = min(root_a, root_b)

    base_hits = [0] * len(catalog)
    by_name: dict[str, list[int]] = {}
    for index, item in enumerate(catalog):
        for name in {norm_title(item["title"]), norm_title(item["english_title"])}:
            if len(name.replace(" ", "")) >= 3:
                by_name.setdefault(name, []).append(index)

    for index, item in enumerate(catalog):
        for original in filter(None, {item["title"], item["english_title"]}):
            tokens = norm_title(original).split()
            for length in range(1, len(tokens)):
                base = " ".join(tokens[:length])
                if base not in by_name:
                    continue
                if length == 1 and len(base) < 6:
                    rest = original.lower()[len(base):].lstrip()
                    if not rest or rest[0] not in SEPARATORS:
                        continue
                elif not continues_as_sequel(original, base):
                    continue
                for other in by_name[base]:
                    if other != index:
                        union(index, other)
                        base_hits[other] += 1

    by_prefix: dict[str, list[int]] = {}
    for index, item in enumerate(catalog):
        for name in {norm_title(item["title"]), norm_title(item["english_title"])}:
            tokens = name.split()
            for length in (3, 4):
                prefix = " ".join(tokens[:length])
                if len(tokens) >= length and (length == 4 or len(prefix) >= 14):
                    by_prefix.setdefault(prefix, []).append(index)
    for indices in by_prefix.values():
        for other in indices[1:]:
            union(indices[0], other)

    members: dict[int, list[int]] = {}
    for index in range(len(catalog)):
        members.setdefault(find(index), []).append(index)

    for indices in members.values():
        root = max(indices, key=lambda i: (base_hits[i], catalog[i]["members"] or 0))
        base = catalog[root]
        key = re.sub(r"[^a-z0-9]+", "-", base["title"].lower()).strip("-") or str(base["anime_id"])
        name = base["english_title"] or base["title"]
        for index in indices:
            catalog[index]["group_key"] = key
            catalog[index]["group_title"] = name

def optional_int(value):
    try:
        number = int(float(value))
    except (TypeError, ValueError):
        return None
    return number or None

def optional_float(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return None if np.isnan(number) else round(number, 2)

ANILIST_URL = "https://graphql.anilist.co"
ANILIST_STATUS = {"FINISHED": "Finished Airing", "RELEASING": "Currently Airing", "NOT_YET_RELEASED": "Not Yet Aired", "CANCELLED": "Cancelled", "HIATUS": "On Hiatus"}
ANILIST_FORMAT = {"TV": "TV", "TV_SHORT": "TV", "MOVIE": "MOVIE", "OVA": "OVA", "ONA": "ONA", "SPECIAL": "SPECIAL"}

def refresh_from_anilist(catalog: list[dict]) -> int:
    stale = [item for item in catalog if item["status"] != "Finished Airing" or (item["year"] or 9999) >= 2023]
    by_id = {item["anime_id"]: item for item in stale}
    ids = list(by_id)
    query = """query ($ids: [Int]) { Page(perPage: 50) { media(idMal_in: $ids, type: ANIME) {
      idMal title { english romaji } synonyms status episodes averageScore seasonYear season format } } }"""
    updated = 0
    for start in range(0, len(ids), 50):
        body = json.dumps({"query": query, "variables": {"ids": ids[start:start + 50]}}).encode()
        request = urllib.request.Request(ANILIST_URL, data=body, headers={"Content-Type": "application/json", "Accept": "application/json", "User-Agent": "bunime-catalog-builder"})
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                media = json.load(response)["data"]["Page"]["media"]
        except Exception as error:  # noqa: BLE001 - offline builds must still succeed
            return updated
        for entry in media:
            item = by_id.get(entry.get("idMal"))
            if not item:
                continue
            english = (entry.get("title") or {}).get("english")
            if english and english != item["english_title"]:
                old = item["english_title"]
                item["english_title"] = english
                if old and old not in item["synonyms"]:
                    item["synonyms"] = [old, *item["synonyms"]][:4]
            for name in entry.get("synonyms") or []:
                if name.isascii() and name not in item["synonyms"] and len(item["synonyms"]) < 4:
                    item["synonyms"].append(name)
            item["status"] = ANILIST_STATUS.get(entry.get("status"), item["status"])
            item["total_episodes"] = entry.get("episodes") or item["total_episodes"]
            item["year"] = entry.get("seasonYear") or item["year"]
            item["season"] = (entry.get("season") or "").lower() or item["season"]
            if item["media_type"] == "UNKNOWN":
                item["media_type"] = ANILIST_FORMAT.get(entry.get("format"), "UNKNOWN")
            if item["score"] is None and entry.get("averageScore"):
                item["score"] = round(entry["averageScore"] / 10, 2)
            updated += 1
        time.sleep(0.8)
    return updated

def main() -> int:
    df = pd.read_csv(CSV_PATH, low_memory=False)
    df = df[df["sfw"].astype(str).str.lower() == "true"]
    df = df[~df["type"].astype(str).str.lower().isin(EXCLUDED_TYPES)]
    df = df[df["genres"].map(lambda value: "Hentai" not in parse_list(value))]
    df = df.sort_values("members", ascending=False)
    fresh = (df["members"] >= 1000) & ((df["start_year"] >= 2023) | df["status"].isin(["not_yet_aired", "currently_airing"]))
    df = pd.concat([df.head(MAX_TITLES), df[fresh]]).drop_duplicates("anime_id").reset_index(drop=True)

    catalog = []
    features = []
    tag_features = []
    for _, row in df.iterrows():
        english = row.get("title_english")
        english = english.strip().replace(chr(0xFFFD), "é") if isinstance(english, str) and english.strip() else None
        title = str(row["title"]).replace(chr(0xFFFD), "°")
        genres = parse_list(row.get("genres"))
        themes = parse_list(row.get("themes"))
        demographics = parse_list(row.get("demographics"))
        synopsis = clean_text(row.get("synopsis"))
        year = optional_int(row.get("start_year"))
        catalog.append({
            "anime_id": int(row["anime_id"]),
            "title": title,
            "english_title": english,
            "synonyms": [name for name in parse_list(row.get("title_synonyms")) if name not in (title, english)][:3],
            "synopsis": trim(synopsis, SYNOPSIS_CHARS),
            "genres": genres,
            "themes": themes,
            "demographics": demographics,
            "studios": parse_list(row.get("studios"))[:2],
            "image_url": row["main_picture"] if isinstance(row.get("main_picture"), str) else "",
            "total_episodes": optional_int(row.get("episodes")),
            "status": str(row.get("status") or "unknown").replace("_", " ").title(),
            "media_type": row["type"].upper() if isinstance(row.get("type"), str) else "UNKNOWN",
            "score": optional_float(row.get("score")),
            "members": optional_int(row.get("members")),
            "year": year,
            "season": row["start_season"] if isinstance(row.get("start_season"), str) else None,
        })
        tag_features.append(" ".join(f"t_{re.sub(r'[^a-z0-9]', '', g.lower())}" for g in genres + themes + demographics))
        features.append(synopsis)

    if "--offline" not in sys.argv:
        refresh_from_anilist(catalog)
    assign_franchises(catalog)

    tag_matrix = TfidfVectorizer(token_pattern=r"t_[a-z0-9]+").fit_transform(tag_features)
    text_matrix = TfidfVectorizer(stop_words="english", max_features=40000, sublinear_tf=True, min_df=2).fit_transform(features)
    ids = [item["anime_id"] for item in catalog]
    groups = [item["group_key"] for item in catalog]
    members = np.array([item["members"] or 1 for item in catalog], dtype=float)
    popularity = np.log10(members) / np.log10(members.max())
    main_format = np.array([item["media_type"] in {"TV", "MOVIE", "ONA"} for item in catalog])
    similar: dict[str, list[int]] = {}
    batch = 500
    for start in range(0, len(catalog), batch):
        stop = min(start + batch, len(catalog))
        scores = 0.65 * linear_kernel(tag_matrix[start:stop], tag_matrix) + 0.35 * linear_kernel(text_matrix[start:stop], text_matrix)
        scores = scores * (0.75 + 0.25 * popularity) * np.where(main_format, 1.0, 0.6)
        for offset, row_scores in enumerate(scores):
            index = start + offset
            order = np.argsort(-row_scores)
            picks: list[int] = []
            seen_groups = {groups[index]}
            for candidate in order:
                if groups[candidate] in seen_groups:
                    continue
                seen_groups.add(groups[candidate])
                picks.append(ids[candidate])
                if len(picks) == NEIGHBOURS:
                    break
            similar[str(ids[index])] = picks

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (OUT_DIR / "similar.json").write_text(json.dumps(similar, separators=(",", ":")), encoding="utf-8")
    return 0

if __name__ == "__main__":
    sys.exit(main())
