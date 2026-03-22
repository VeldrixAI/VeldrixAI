"""
VeldrixAI — FastAPI ASGI middleware example.
"""
from fastapi import FastAPI
from veldrixai.middleware import VeldrixMiddleware

app = FastAPI()

# Add VeldrixAI middleware — evaluates all AI requests in background
app.add_middleware(
    VeldrixMiddleware,
    api_key="vx-live-your-key-here",
    capture_paths=["/api/"],     # only monitor /api/* routes
    exclude_paths=["/health"],   # always skip health check
)


@app.post("/api/chat")
async def chat(body: dict):
    import openai
    client = openai.AsyncOpenAI()
    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=body.get("messages", []),
    )
    return {"response": response.choices[0].message.content}
