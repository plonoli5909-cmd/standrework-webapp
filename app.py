import os
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse

app = FastAPI(title="Hunter Faceit API")

@app.get("/")
async def root():
    return {"ok": True, "service": "Hunter Faceit API"}

@app.get("/api/health")
async def health():
    return {"status": "ok", "bot_token_set": bool(os.environ.get("TELEGRAM_BOT_TOKEN"))}

@app.post("/api/auth")
async def auth(request: Request):
    body = await request.json()
    init_data = body.get("initData", "")
    if not init_data:
        raise HTTPException(401, "initData is empty")
    return {"ok": True, "received_length": len(init_data)}