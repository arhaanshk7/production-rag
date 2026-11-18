import argparse
import json
import os
import sys
import uuid

sys.path.insert(0, os.getcwd())

from sqlalchemy import text

from app.db.session import SessionLocal
from app.services.document_processor import encode_query


def format_embedding(embedding):
    return "[" + ",".join(str(float(value)) for value in embedding) + "]"


def rrf_fusion(bm25_rows, vector_rows, top_n=5, k=60):
    scores = {}
    rows = {}

    for results in [bm25_rows, vector_rows]:
        for rank, row in enumerate(results, 1):
            chunk_id = row.chunk_id
            scores[chunk_id] = scores.get(chunk_id, 0) + 1 / (k + rank)
            rows[chunk_id] = row

    top_ids = sorted(scores, key=scores.get, reverse=True)[:top_n]
    return [rows[chunk_id] for chunk_id in top_ids]


def retrieve(db, question, document_id):
    embedding = encode_query(question)

    bm25_rows = db.execute(
        text("""
            SELECT c.chunk_id, c.chunk_index, c.page_number,
                   pdb.score(c.chunk_id) AS bm25_score
            FROM document_chunks AS c
            WHERE c.chunk_text ||| :question
              AND c.document_id = :document_id
            ORDER BY bm25_score DESC
            LIMIT 20
        """),
        {"question": question, "document_id": document_id},
    ).all()

    vector_rows = db.execute(
        text("""
            SELECT c.chunk_id, c.chunk_index, c.page_number,
                   c.embedding <=> CAST(:question_embedding AS vector) AS distance
            FROM document_chunks AS c
            WHERE c.document_id = :document_id
            ORDER BY c.embedding <=> CAST(:question_embedding AS vector)
            LIMIT 20
        """),
        {
            "question_embedding": format_embedding(embedding),
            "document_id": document_id,
        },
    ).all()

    return bm25_rows, vector_rows


def top5_details(rows, gold):
    return [
        {
            "rank": rank,
            "chunk_index": row.chunk_index,
            "page_number": row.page_number,
            "chunk_id": str(row.chunk_id),
            "hit": str(row.chunk_id) in gold,
        }
        for rank, row in enumerate(rows, 1)
    ]


def evaluate_document(db, name):
    with open(f"evals/golden_{name}.json", encoding="utf-8") as f:
        golden = json.load(f)

    document_id = uuid.UUID(golden["document_id"])
    results = []
    vector_total = 0.0
    rrf_total = 0.0

    for number, item in enumerate(golden["questions"], 1):
        question = item["question"]
        gold = set(item["relevant_chunk_ids"])
        gold_count = len(gold)

        bm25_rows, vector_rows = retrieve(db, question, document_id)
        vector_top5 = vector_rows[:5]
        rrf_top5 = rrf_fusion(bm25_rows, vector_rows)

        vector_hits = sum(1 for row in vector_top5 if str(row.chunk_id) in gold)
        rrf_hits = sum(1 for row in rrf_top5 if str(row.chunk_id) in gold)
        vector_recall = vector_hits / gold_count
        rrf_recall = rrf_hits / gold_count

        vector_total += vector_recall
        rrf_total += rrf_recall

        print(
            f"{name:8s} q{number:02d}  "
            f"vector {vector_hits}/{gold_count}={vector_recall:.3f}  "
            f"rrf {rrf_hits}/{gold_count}={rrf_recall:.3f}"
        )

        results.append({
            "number": number,
            "question": question,
            "gold_ids": item["relevant_chunk_ids"],
            "vector_hits": vector_hits,
            "vector_recall": vector_recall,
            "vector_top5": top5_details(vector_top5, gold),
            "rrf_hits": rrf_hits,
            "rrf_recall": rrf_recall,
            "rrf_top5": top5_details(rrf_top5, gold),
        })

    count = len(results)
    return {
        "question_count": count,
        "vector_recall_at_5": vector_total / count,
        "rrf_recall_at_5": rrf_total / count,
        "questions": results,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--docs", nargs="+", default=["avengers", "handbook"])
    parser.add_argument("--no-write", action="store_true")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        output = {
            "documents": {
                name: evaluate_document(db, name)
                for name in args.docs
            }
        }
    finally:
        db.close()

    if not args.no_write:
        with open("evals/results.json", "w", encoding="utf-8") as f:
            json.dump(output, f, ensure_ascii=False, indent=2)

    print("\nAverages")
    for name, result in output["documents"].items():
        print(
            f"  {name:8s} vector={result['vector_recall_at_5']:.3f}  "
            f"rrf={result['rrf_recall_at_5']:.3f}"
        )
    if not args.no_write:
        print("\nWrote evals/results.json")


if __name__ == "__main__":
    main()
