"""VeldrixAI with fully async LLM calls."""

import asyncio
from veldrixai import Veldrix
from openai    import AsyncOpenAI

client  = AsyncOpenAI()
veldrix = Veldrix(api_key="vx-live-your-key-here")


@veldrix.guard
async def chat(messages):
    return await client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
    )


async def main():
    response = await chat([{"role": "user", "content": "Tell me about Mars."}])
    print(response.choices[0].message.content)
    print(f"Trust: {response.trust.verdict}")

asyncio.run(main())
