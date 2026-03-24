"""
Steady — FastAPI glucose simulation engine.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from dotenv import load_dotenv

load_dotenv()

from routes.simulate import router as simulate_router
from routes.extract import router as extract_router
from routes.advise import router as advise_router

app = FastAPI(title="Steady", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(simulate_router)
app.include_router(extract_router)
app.include_router(advise_router)


@app.get("/health")
def health():
    return {"status": "ok"}
