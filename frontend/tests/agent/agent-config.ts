import { PILLAR_VERIFICATION_PROMPT }  from './prompts/pillar-verification';
import { EDGE_CASE_HUNTING_PROMPT }    from './prompts/edge-case-hunting';
import { AUDIT_VERIFICATION_PROMPT }   from './prompts/audit-verification';
import { POLICY_EXPLORATION_PROMPT }   from './prompts/policy-exploration';

export interface CoverageArea {
  name: string;
  instructions: string;
  /** Estimated number of agent steps needed */
  estimatedSteps: number;
  /** If true, a FAIL here blocks the agent report from being green */
  blocking: boolean;
}

export const AGENT_COVERAGE_AREAS: CoverageArea[] = [
  {
    name: 'pillar-verification',
    instructions: PILLAR_VERIFICATION_PROMPT,
    estimatedSteps: 25,
    blocking: true,
  },
  {
    name: 'edge-case-hunting',
    instructions: EDGE_CASE_HUNTING_PROMPT,
    estimatedSteps: 40,
    blocking: false,
  },
  {
    name: 'audit-verification',
    instructions: AUDIT_VERIFICATION_PROMPT,
    estimatedSteps: 20,
    blocking: true,
  },
  {
    name: 'policy-exploration',
    instructions: POLICY_EXPLORATION_PROMPT,
    estimatedSteps: 36,
    blocking: false,
  },
];

export const AGENT_DEFAULTS = {
  maxSteps:    parseInt(process.env.AGENT_MAX_STEPS    || '50'),
  stepTimeout: parseInt(process.env.AGENT_STEP_TIMEOUT || '30000'),
  model:       process.env.AGENT_REASONING_MODEL        || 'claude-opus-4-6',
} as const;
