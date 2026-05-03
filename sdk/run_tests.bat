@echo off
C:\Users\dhima\AppData\Local\Programs\Python\Python311\python.exe -m pip install pytest pytest-asyncio respx httpx pydantic --quiet
C:\Users\dhima\AppData\Local\Programs\Python\Python311\python.exe -m pytest tests/ -v --tb=short
