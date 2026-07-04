"""
Continuum's Cognee service.

This service keeps the Python-only `cognee` package isolated from the
TypeScript stack. The Express backend talks to this FastAPI app over HTTP.

The implementation is intentionally defensive because Cognee's Python API has
changed across versions. We try the cloud path when the package exposes it,
then fall back to the local add/cognify/search path when needed.
"""

import io
import os
import traceback
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

load_dotenv()

import cognee
from cognee.api.v1.search import SearchType

app = FastAPI(title="Continuum Cognee Service")

SERVICE_URL = (
    os.environ.get("COGNEE_SERVICE_URL")
    or os.environ.get("COGNEE_CLOUD_API_URL")
    or "https://api.cognee.ai"
)
API_KEY = os.environ.get("COGNEE_API_KEY") or os.environ.get("COGNEE_CLOUD_API_KEY")
CLOUD_MODE = bool(API_KEY)
HAS_SERVE = hasattr(cognee, "serve")
HAS_REMEMBER = hasattr(cognee, "remember")
HAS_RECALL = hasattr(cognee, "recall")
HAS_ADD = hasattr(cognee, "add")
HAS_COGNIFY = hasattr(cognee, "cognify")
HAS_SEARCH = hasattr(cognee, "search")
HAS_PRUNE = hasattr(cognee, "prune") and hasattr(cognee.prune, "prune_data")

_cloud_client_ready = False
_cloud_client = None 


async def ensure_cloud_client() -> None:
    """Connect to Cognee Cloud once, lazily, when the SDK supports it."""
    global _cloud_client_ready, _cloud_client
    if _cloud_client_ready or not HAS_SERVE:
        return
    try:
        print(
            f"[cognee] connecting to cloud url={SERVICE_URL} api_key={'set' if API_KEY else 'missing'}",
            flush=True,
        )
        _cloud_client = await cognee.serve(url=SERVICE_URL, api_key=API_KEY)
        _cloud_client_ready = True
        print(f"[cognee] connected to remote cloud at {SERVICE_URL}", flush=True)
    except Exception:
        traceback.print_exc()
        _cloud_client = None
        _cloud_client_ready = False
        raise


def dataset_for(patient_id: str) -> str:
    return f"patient_{patient_id}"


class RememberRequest(BaseModel):
    patientId: str
    fragmentId: str
    content: str
    metadata: dict[str, Any] = {}


class RecallRequest(BaseModel):
    patientId: str
    query: str


@app.get("/health")
async def health():
    if CLOUD_MODE:
        return {
            "ok": True,
            "mode": "cloud",
            "cloud_url": SERVICE_URL,
            "sdk_supports_serve": HAS_SERVE,
        }
    return {
        "ok": True,
        "mode": "self-hosted",
        "llm_configured": bool(os.environ.get("LLM_API_KEY")),
    }


def _tag_content(req: RememberRequest) -> str:
    return (
        f"[source: {req.metadata.get('originInstitution', 'unknown')}, "
        f"type: {req.metadata.get('sourceType', 'unknown')}, "
        f"fragment_id: {req.fragmentId}] {req.content}"
    )


async def _remember_local(dataset: str, tagged_content: str) -> None:
    if not HAS_ADD or not HAS_COGNIFY:
        raise HTTPException(
            status_code=503,
            detail="Cognee package does not expose add/cognify in this environment.",
        )
    await cognee.add(tagged_content, dataset_name=dataset)
    await cognee.cognify([dataset])


async def _remember_cloud(dataset: str, tagged_content: str) -> None:
    if not HAS_REMEMBER:
        raise HTTPException(
            status_code=503,
            detail="Cognee cloud mode is unavailable in this install. Use a cloud-capable SDK or switch to local mode with a real LLM key.",
        )
    if not HAS_SERVE:
        raise HTTPException(
            status_code=503,
            detail="Cognee cloud mode is unavailable in this install. The SDK does not expose serve().",
        )
    await ensure_cloud_client()
    if _cloud_client is None:
        raise HTTPException(status_code=503, detail="Cognee cloud client did not initialize.")
    # The SDK's remember() accepts plain strings directly (it wraps them in BytesIO
    # internally). Pass the tagged text with an explicit filename so the cloud
    # stores it with a meaningful name instead of the generic "data.txt".
    file_obj = io.BytesIO(tagged_content.encode("utf-8"))
    file_obj.name = f"{dataset}_fragment.txt"
    await _cloud_client.remember(file_obj, dataset_name=dataset)


async def _recall_cloud(dataset: str, query: str) -> tuple[str, list[Any]]:
    if not HAS_RECALL:
        raise HTTPException(
            status_code=503,
            detail="Cognee cloud recall is unavailable in this install. Use a cloud-capable SDK or switch to local mode with a real LLM key.",
        )
    if not HAS_SERVE:
        raise HTTPException(
            status_code=503,
            detail="Cognee cloud recall is unavailable in this install. The SDK does not expose serve().",
        )
    await ensure_cloud_client()
    if _cloud_client is None:
        raise HTTPException(status_code=503, detail="Cognee cloud client did not initialize.")
    try:
        results = await _cloud_client.recall(query_text=query, datasets=[dataset])
    except RuntimeError as exc:
        err_str = str(exc)
        # 404 means the dataset has not been ingested/cognified yet — not a real
        # error, just no history available for this patient.
        if "404" in err_str or "prerequisites not met" in err_str.lower():
            print(
                f"[cognee] recall 404 for dataset={dataset} — no data ingested yet, returning empty answer.",
                flush=True,
            )
            return "Cognee found no related history for this patient yet.", []
        raise
    return _extract_answer(results), list(results)


@app.post("/remember")
async def remember(req: RememberRequest):
    dataset = dataset_for(req.patientId)
    tagged_content = _tag_content(req)

    try:
        print(
            f"[cognee] remember request patient={req.patientId} dataset={dataset} "
            f"source_type={req.metadata.get('sourceType', 'unknown')} cloud_mode={CLOUD_MODE}",
            flush=True,
        )
        if CLOUD_MODE:
            await _remember_cloud(dataset, tagged_content)
        else:
            if not os.environ.get("LLM_API_KEY"):
                raise HTTPException(
                    status_code=503,
                    detail=(
                        "Neither COGNEE_API_KEY nor LLM_API_KEY is set. Set one in "
                        "cognee-service/.env (see .env.example)."
                    ),
                )
            await _remember_local(dataset, tagged_content)
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")


def _extract_answer(results: list[Any]) -> str:
    """Extract a readable answer from Cognee results.

    Handles both attribute-style objects (local/self-hosted mode) and plain
    dicts returned by the cloud SDK's JSON response.
    """
    def _get(r: Any, key: str):
        # Try attribute access first (Pydantic objects), then dict access (cloud JSON).
        val = getattr(r, key, None)
        if val is None and isinstance(r, dict):
            val = r.get(key)
        return val

    # Cloud results often contain the answer in the "text" key.
    text_answers = [_get(r, "text") for r in results if _get(r, "text")]
    if text_answers:
        return "\n".join(str(a) for a in text_answers)

    qa_answers = [_get(r, "answer") for r in results if _get(r, "answer")]
    if qa_answers:
        return "\n".join(str(a) for a in qa_answers)

    context_snippets = [_get(r, "content") for r in results if _get(r, "content")]
    if context_snippets:
        return "\n".join(str(c) for c in context_snippets)

    # Cloud recall may return the answer directly as a top-level string item.
    if results and isinstance(results[0], str):
        return "\n".join(results)

    # Robust fallback: join non-empty string representations of results
    if results:
        res_strs = [str(r) for r in results if str(r).strip()]
        if res_strs:
            return "\n".join(res_strs)

    return "Cognee found no related history for this patient yet."


@app.post("/recall")
async def recall(req: RecallRequest):
    dataset = dataset_for(req.patientId)
    try:
        print(
            f"[cognee] recall request patient={req.patientId} dataset={dataset} cloud_mode={CLOUD_MODE}",
            flush=True,
        )
        if CLOUD_MODE:
            answer, raw = await _recall_cloud(dataset, req.query)
            return {"answer": answer, "raw": [str(r) for r in raw]}

        if HAS_RECALL:
            results = await cognee.recall(
                query_text=req.query,
                datasets=[dataset],
            )
            # Ensure results is a list for extraction
            results_list = list(results) if isinstance(results, (list, tuple, set)) else [results]
            answer = _extract_answer(results_list)
            return {
                "answer": answer,
                "raw": [str(r) for r in results_list]
            }

        if HAS_SEARCH:
            results = await cognee.search(
                query_type=SearchType.GRAPH_COMPLETION,
                query_text=req.query,
                datasets=[dataset],
            )
            answer = "\n".join(str(r) for r in results) if results else "Cognee found no related history for this patient yet."
            return {"answer": answer, "raw": results}

        raise HTTPException(
            status_code=503,
            detail="Cognee recall is unavailable in this environment.",
        )
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")


@app.post("/forget/{patient_id}")
async def forget(patient_id: str):
    dataset = dataset_for(patient_id)
    try:
        print(f"[cognee] forget request patient={patient_id} dataset={dataset} cloud_mode={CLOUD_MODE}", flush=True)
        if CLOUD_MODE and HAS_SERVE:
            await ensure_cloud_client()
            await cognee.forget(dataset=dataset)
        elif HAS_PRUNE:
            await cognee.prune.prune_data(datasets=[dataset])
        else:
            raise HTTPException(
                status_code=503,
                detail="Cognee forget is unavailable in this environment.",
            )
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")
