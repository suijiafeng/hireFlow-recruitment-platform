import type { ApplicationStatus, JobStatus } from '@hireflow/shared';

export interface Paginated<T> {
  total: number;
  page: number;
  pageSize: number;
  items: T[];
}

export interface Department {
  id: string;
  name: string;
}

export interface UserBrief {
  id: string;
  name: string;
  email?: string;
}

export interface Job {
  id: string;
  title: string;
  description?: string | null;
  requirement?: string | null;
  headcount: number;
  status: JobStatus;
  department: Department;
  hiringManager: UserBrief | null;
  _count?: { applications: number };
  createdAt: string;
}

export interface CandidateApplicationBrief {
  id: string;
  job: { id: string; title: string };
  stage: { id: string; name: string };
  status: ApplicationStatus;
}

export interface Candidate {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  tags: string[];
  applications?: CandidateApplicationBrief[];
  _count?: { resumes: number };
  createdAt: string;
}

export interface BoardCard {
  id: string;
  status: ApplicationStatus;
  matchScore: number | null;
  position: number;
  createdAt: string;
  stageId: string;
  candidate: { id: string; name: string; tags: string[]; source: string | null };
}

export interface BoardColumn {
  stage: { id: string; name: string; order: number };
  applications: BoardCard[];
}

export interface BoardData {
  job: { id: string; title: string; status: JobStatus };
  columns: BoardColumn[];
}
