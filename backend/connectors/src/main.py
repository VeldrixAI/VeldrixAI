from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.modules.reports.controllers.report_controller import router as reports_router
from src.modules.analytics.controller import router as analytics_router
from src.modules.analytics.audit_controller import router as audit_trails_router
from src.modules.analytics.latency_controller import router as latency_router
from src.modules.prompts.controller import router as prompts_router

app = FastAPI(
    title="VeldrixAI Connectors - Reports API",
    description="Report generation and storage pipeline",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(reports_router)
app.include_router(analytics_router)
app.include_router(audit_trails_router)
app.include_router(latency_router)
app.include_router(prompts_router)


@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "veldrix-connectors"}



if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8004)
