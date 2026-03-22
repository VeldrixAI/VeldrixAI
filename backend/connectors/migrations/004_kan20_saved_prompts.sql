-- KAN-20: saved_prompts table
-- Run in pgAdmin against the AegisAI database

CREATE TABLE IF NOT EXISTS saved_prompts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    variant VARCHAR(20) NOT NULL CHECK (variant IN ('Strict', 'Balanced', 'Adaptive')),
    prompt_text TEXT NOT NULL,
    config_json JSONB,
    industry VARCHAR(100),
    region VARCHAR(20),
    strictness INTEGER DEFAULT 3 CHECK (strictness BETWEEN 1 AND 5),
    keywords TEXT,
    is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_prompts_user_id ON saved_prompts(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_prompts_user_created ON saved_prompts(user_id, created_at DESC);
