"""VeldrixAI + LangChain."""

from veldrixai               import Veldrix
from langchain_openai        import ChatOpenAI
from langchain_core.messages import HumanMessage

veldrix = Veldrix(api_key="vx-live-your-key-here")
llm     = ChatOpenAI(model="gpt-4o")


@veldrix.guard
def chat(user_input: str):
    return llm.invoke([HumanMessage(content=user_input)])


if __name__ == "__main__":
    response = chat("What are the symptoms of the flu?")
    print(response.content)                     # LangChain AIMessage.content
    print(f"Verdict: {response.trust.verdict}") # VeldrixAI trust
