#!/usr/bin/env python3
"""Utilities for working with the TradeZone trade-in price grid.

Usage examples:

Convert CSV to JSONL for OpenAI vector stores:
    python scripts/tradein_price_tool.py to-jsonl \
        --csv "Tradezone Price Grid Nov 12 2025.csv" \
        --out data/tradezone_price_grid.jsonl \
        --price-grid-version 2025-11-12

Compute a deterministic quote/top-up JSON:
    python scripts/tradein_price_tool.py quote \
        --csv "Tradezone Price Grid Nov 12 2025.csv" \
        --trade-model "ROG Ally X" --trade-variant "1TB" --trade-condition preowned \
        --target-model "PS5 Pro" --target-variant "2TB Digital" \
        --used-discount 0
"""

from __future__ import annotations

import argparse
import csv
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Optional

GridRow = dict


@dataclass
class GridLookup:
    product_family: str
    product_model: str
    variant: str
    condition: str
    trade_in_value_min_sgd: Optional[float]
    trade_in_value_max_sgd: Optional[float]
    brand_new_price_sgd: Optional[float]
    source: str
    confidence: float
    notes: str

    @classmethod
    def from_row(cls, row: GridRow) -> "GridLookup":
        def f(key: str) -> Optional[float]:
            value = row.get(key, "").strip()
            if value == "" or value.lower() == "null":
                return None
            return float(value)

        return cls(
            product_family=row.get("product_family", "").strip(),
            product_model=row.get("product_model", "").strip(),
            variant=row.get("variant", "").strip(),
            condition=row.get("condition", "").strip(),
            trade_in_value_min_sgd=f("trade_in_value_min_sgd"),
            trade_in_value_max_sgd=f("trade_in_value_max_sgd"),
            brand_new_price_sgd=f("brand_new_price_sgd"),
            source=row.get("source", "").strip(),
            confidence=float(row.get("confidence", 0) or 0),
            notes=row.get("notes", "").strip(),
        )

    def matches(self, model: str, variant: Optional[str], condition: Optional[str]) -> bool:
        def norm(text: Optional[str]) -> str:
            return (text or "").strip().lower()

        return (
            norm(self.product_model) == norm(model)
            and (variant is None or norm(self.variant) == norm(variant))
            and (condition is None or norm(self.condition) == norm(condition))
        )

    def trade_value_mid(self) -> Optional[float]:
        values = [v for v in (self.trade_in_value_min_sgd, self.trade_in_value_max_sgd) if v is not None]
        if not values:
            return None
        if len(values) == 1:
            return values[0]
        if values[0] == values[1]:
            return values[0]
        return sum(values) / len(values)


@dataclass
class QuoteResult:
    trade: GridLookup
    target: GridLookup
    trade_value_sgd: float
    target_price_sgd: float
    used_device_discount_sgd: float

    @property
    def top_up_sgd(self) -> float:
        return self.target_price_sgd - self.trade_value_sgd - self.used_device_discount_sgd

    def to_response(self) -> dict:
        calc_line = (
            f"target_price_sgd ({self.target_price_sgd:.0f}) - "
            f"trade_in_value_sgd ({self.trade_value_sgd:.0f}) - "
            f"used_device_discount_sgd ({self.used_device_discount_sgd:.0f}) = "
            f"{self.top_up_sgd:.0f}"
        )
        response = {
            "reply_text": (
                f"Trade-in value for {self.trade.product_model} {self.trade.variant} "
                f"({self.trade.condition}) is {self.trade_value_sgd:.0f} SGD. "
                f"{self.target.product_model} {self.target.variant} costs {self.target_price_sgd:.0f} SGD. "
                f"Top-up ≈ {self.top_up_sgd:.0f} SGD (assumes {self.trade.condition} with full set)."
            ),
            "slots_filled": {
                "trade_in_brand": self.trade.product_family,
                "trade_in_model": self.trade.product_model,
                "trade_in_variant": self.trade.variant,
                "trade_in_condition": self.trade.condition,
                "trade_in_value_sgd": round(self.trade_value_sgd, 2),
                "target_brand": self.target.product_family,
                "target_model": self.target.product_model,
                "target_variant": self.target.variant,
                "target_price_sgd": round(self.target_price_sgd, 2),
                "used_device_discount_sgd": round(self.used_device_discount_sgd, 2),
            },
            "top_up_sgd": round(self.top_up_sgd, 2),
            "calculation_steps": [calc_line],
            "confidence": min(self.trade.confidence, self.target.confidence),
            "provenance": [
                {
                    "field": "trade_in_value_sgd",
                    "source": self.trade.source,
                    "confidence": self.trade.confidence,
                },
                {
                    "field": "target_price_sgd",
                    "source": self.target.source,
                    "confidence": self.target.confidence,
                },
            ],
            "flags": {
                "requires_human_review": False,
                "is_provisional": False,
            },
        }
        return response


def load_grid(csv_path: Path) -> List[GridLookup]:
    with csv_path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return [GridLookup.from_row(row) for row in reader]


def find_row(rows: Iterable[GridLookup], model: str, variant: Optional[str], condition: Optional[str]) -> GridLookup:
    matches = [row for row in rows if row.matches(model, variant, condition)]
    if not matches:
        raise SystemExit(f"No grid rows found for model='{model}' variant='{variant}' condition='{condition}'")
    if len(matches) > 1:
        raise SystemExit(
            f"Multiple rows found for model='{model}', variant='{variant}', condition='{condition}'. "
            "Make the CSV entries unique or pass a more specific variant."
        )
    return matches[0]


def cmd_quote(args: argparse.Namespace) -> None:
    csv_path = Path(args.csv)
    rows = load_grid(csv_path)

    trade_row = find_row(rows, args.trade_model, args.trade_variant, args.trade_condition)
    target_row = find_row(rows, args.target_model, args.target_variant, "brand_new")

    trade_value = trade_row.trade_value_mid() or 0.0
    target_price = target_row.brand_new_price_sgd or target_row.trade_value_mid() or 0.0

    result = QuoteResult(
        trade=trade_row,
        target=target_row,
        trade_value_sgd=trade_value,
        target_price_sgd=target_price,
        used_device_discount_sgd=args.used_discount,
    )

    print(json.dumps(result.to_response(), indent=2))


def cmd_to_jsonl(args: argparse.Namespace) -> None:
    csv_path = Path(args.csv)
    rows = load_grid(csv_path)
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    version = args.price_grid_version

    with out_path.open("w", encoding="utf-8") as f:
        for row in rows:
            text_parts = [
                f"TradeZone price grid v{version}.",
                f"{row.product_family} {row.product_model} {row.variant} ({row.condition}).",
            ]
            if row.trade_in_value_min_sgd is not None:
                if row.trade_in_value_max_sgd and row.trade_in_value_max_sgd != row.trade_in_value_min_sgd:
                    text_parts.append(
                        f"Trade-in value {row.trade_in_value_min_sgd:.0f}-{row.trade_in_value_max_sgd:.0f} SGD."
                    )
                else:
                    text_parts.append(f"Trade-in value {row.trade_in_value_min_sgd:.0f} SGD.")
            if row.brand_new_price_sgd is not None:
                text_parts.append(f"Brand-new price {row.brand_new_price_sgd:.0f} SGD.")
            if row.notes:
                text_parts.append(row.notes)

            metadata = {
                "product_family": row.product_family,
                "product_model": row.product_model,
                "variant": row.variant,
                "condition": row.condition,
                "trade_in_value_min_sgd": row.trade_in_value_min_sgd,
                "trade_in_value_max_sgd": row.trade_in_value_max_sgd,
                "brand_new_price_sgd": row.brand_new_price_sgd,
                "source": row.source,
                "confidence": row.confidence,
                "price_grid_version": version,
            }
            obj = {
                "id": f"{row.product_model}-{row.variant}-{row.condition}".replace(" ", "_").lower(),
                "metadata": metadata,
                "text": " ".join(text_parts),
            }
            f.write(json.dumps(obj, ensure_ascii=False) + "\n")

    print(f"Wrote {len(rows)} rows to {out_path}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Trade-in price grid utilities")
    sub = parser.add_subparsers(dest="command", required=True)

    quote = sub.add_parser("quote", help="Compute deterministic trade-in quote")
    quote.add_argument("--csv", required=True)
    quote.add_argument("--trade-model", required=True)
    quote.add_argument("--trade-variant", required=True)
    quote.add_argument("--trade-condition", required=True)
    quote.add_argument("--target-model", required=True)
    quote.add_argument("--target-variant", required=True)
    quote.add_argument("--used-discount", dest="used_discount", type=float, default=0.0, help="Discount applied to target product")
    quote.set_defaults(func=cmd_quote)

    to_jsonl = sub.add_parser("to-jsonl", help="Convert CSV grid to JSONL for vector store upload")
    to_jsonl.add_argument("--csv", required=True)
    to_jsonl.add_argument("--out", required=True)
    to_jsonl.add_argument("--price-grid-version", required=True)
    to_jsonl.set_defaults(func=cmd_to_jsonl)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
