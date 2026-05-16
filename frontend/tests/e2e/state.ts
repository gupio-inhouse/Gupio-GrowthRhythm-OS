import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const E2E_PASSWORD = 'Password@123';
export const E2E_STATE_PATH = path.join(__dirname, '.e2e-state.json');

export type E2EState = {
  runId: string;
  orgId: string;
  departmentId: string;
  departmentName: string;
  departmentSlug: string;
  users: {
    owner: string;
    companyAdmin: string;
    departmentHead: string;
    manager: string;
    teamMember: string;
    coach: string;
    superAdmin: string;
  };
};
