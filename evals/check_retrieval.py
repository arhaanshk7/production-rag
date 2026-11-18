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


def show(label, rows, gold):
    print(f"\n{label}")
    found = 0
    for rank, row in enumerate(rows, 1):
        hit = str(row.chunk_id) in gold
        found += hit
        print(
            f"  {rank}. chunk_index={row.chunk_index} page={row.page_number} "
            f"hit={hit} id={row.chunk_id}"
        )
    print(f"  found {found}/{len(gold)} gold ids ({found / len(gold):.3f})")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--doc", default="avengers", choices=["avengers", "handbook"])
    parser.add_argument("--index", type=int, default=0)
    args = parser.parse_args()

    with open(f"evals/golden_{args.doc}.json", encoding="utf-8") as f:
        golden = json.load(f)

    item = golden["questions"][args.index]
    question = item["question"]
    gold = set(item["relevant_chunk_ids"])
    user_id = uuid.UUID(golden["user_id"])
    conversation_id = uuid.UUID(golden["conversation_id"])
    document_id = uuid.UUID(golden["document_id"])

    print(f"Question: {question}")
    print(f"Gold ids: {sorted(gold)}")

    embedding = encode_query(question)
    db = SessionLocal()
    try:
        params = {
            "question": question,
            "user_id": user_id,
            "conversation_id": conversation_id,
            "document_id": document_id,
        }
        bm25_rows = db.execute(
            text("""
                SELECT c.chunk_id, c.chunk_index, c.chunk_text, c.page_number,
                       pdb.score(c.chunk_id) AS bm25_score
                FROM document_chunks AS c
                WHERE c.chunk_text ||| :question
                  AND c.document_id = :document_id
                ORDER BY bm25_score DESC
                LIMIT 20
            """),
            params,
        ).all()

        vector_rows = db.execute(
            text("""
                SELECT c.chunk_id, c.chunk_index, c.chunk_text, c.page_number,
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
    finally:
        db.close()

    show("Vector-only top 5", vector_rows[:5], gold)
    show("RRF hybrid top 5", rrf_fusion(bm25_rows, vector_rows), gold)


if __name__ == "__main__":
    main()
