
from __future__ import annotations

import re

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
