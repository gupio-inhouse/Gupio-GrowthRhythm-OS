import api from './client';

export interface LearningModule {
  id: string;
  orgId: string;
  departmentId: string | null;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  type: 'ONBOARDING' | 'COMPLIANCE' | 'SKILLS' | 'PRODUCT' | 'PROCESS' | 'CERTIFICATION' | 'OTHER';
  isPublished: boolean;
  isMandatory: boolean;
  passScore: number;
  durationDays: number | null;
  order: number;
  isActive: boolean;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  department?: { id: string; name: string; slug: string } | null;
  createdBy?: { id: string; name: string; avatarUrl: string | null };
  _count?: { lessons: number; enrollments: number; phases: number };
}

export interface LearningPhase {
  id: string;
  moduleId: string;
  title: string;
  phaseNumber: number;
  color: string | null;
  dayStart: number | null;
  dayEnd: number | null;
  order: number;
  createdAt: string;
}

export interface LearningLesson {
  id: string;
  moduleId: string;
  phaseId: string | null;
  title: string;
  description: string | null;
  contentType: 'VIDEO' | 'PDF' | 'ARTICLE' | 'QUIZ' | 'EMBED' | 'CHECKPOINT';
  contentUrl: string | null;
  contentBody: string | null;
  topics: string[] | null;
  dayStart: number | null;
  dayEnd: number | null;
  checkpointItems: string[] | null;
  durationMins: number | null;
  order: number;
  isRequired: boolean;
  createdAt: string;
  updatedAt: string;
  quizzes?: LearningQuiz[];
}

export interface LearningQuiz {
  id: string;
  lessonId: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string | null;
  points: number;
  order: number;
}

export interface LearningEnrollment {
  id: string;
  orgId: string;
  moduleId: string;
  userId: string;
  status: 'ENROLLED' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE' | 'DROPPED';
  enrolledAt: string;
  dueDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  score: number | null;
  passed: boolean | null;
  user?: { id: string; name: string; email: string; avatarUrl: string | null; role: string };
  _count?: { progress: number };
}

export interface LessonProgress {
  id: string;
  enrollmentId: string;
  lessonId: string;
  userId: string;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  startedAt: string | null;
  completedAt: string | null;
  timeSpentSec: number;
  videoPosition: number | null;
  quizScore: number | null;
  quizAttempts: number;
  quizAnswers: number[] | null;
}

export interface LearningCertificate {
  id: string;
  enrollmentId: string;
  userId: string;
  moduleId: string;
  issuedAt: string;
  certificateUrl: string | null;
}

export interface ModuleWithDetails extends LearningModule {
  phases: LearningPhase[];
  lessons: LearningLesson[];
  myEnrollment: (LearningEnrollment & { progress: LessonProgress[]; certificate: LearningCertificate | null }) | null;
}

export interface LearningAnalytics {
  moduleCount: number;
  enrollmentCount: number;
  completionCount: number;
  completionRate: number;
  certificateCount: number;
  topModules: LearningModule[];
}

// ─── API calls ────────────────────────────────────────────────────────────────

export const learningApi = {
  // Modules
  getModules: () => api.get<LearningModule[]>('/learning/modules').then((r) => r.data),
  getAdminModules: () => api.get<LearningModule[]>('/learning/modules/admin').then((r) => r.data),
  getModule: (id: string) => api.get<ModuleWithDetails>(`/learning/modules/${id}`).then((r) => r.data),
  createModule: (data: Partial<LearningModule>) =>
    api.post<LearningModule>('/learning/modules', data).then((r) => r.data),
  updateModule: (id: string, data: Partial<LearningModule>) =>
    api.patch<LearningModule>(`/learning/modules/${id}`, data).then((r) => r.data),
  deleteModule: (id: string) => api.delete(`/learning/modules/${id}`),
  publishModule: (id: string) =>
    api.post<LearningModule>(`/learning/modules/${id}/publish`).then((r) => r.data),

  // Phases
  createPhase: (moduleId: string, data: Partial<LearningPhase>) =>
    api.post<LearningPhase>(`/learning/modules/${moduleId}/phases`, data).then((r) => r.data),
  updatePhase: (moduleId: string, phaseId: string, data: Partial<LearningPhase>) =>
    api.patch(`/learning/modules/${moduleId}/phases/${phaseId}`, data).then((r) => r.data),
  deletePhase: (moduleId: string, phaseId: string) =>
    api.delete(`/learning/modules/${moduleId}/phases/${phaseId}`),

  // Lessons
  createLesson: (moduleId: string, data: Partial<LearningLesson>) =>
    api.post<LearningLesson>(`/learning/modules/${moduleId}/lessons`, data).then((r) => r.data),
  updateLesson: (moduleId: string, lessonId: string, data: Partial<LearningLesson>) =>
    api.patch(`/learning/modules/${moduleId}/lessons/${lessonId}`, data).then((r) => r.data),
  deleteLesson: (moduleId: string, lessonId: string) =>
    api.delete(`/learning/modules/${moduleId}/lessons/${lessonId}`),

  // Quizzes
  createQuiz: (moduleId: string, lessonId: string, data: Partial<LearningQuiz>) =>
    api.post<LearningQuiz>(`/learning/modules/${moduleId}/lessons/${lessonId}/quizzes`, data).then((r) => r.data),
  updateQuiz: (moduleId: string, lessonId: string, quizId: string, data: Partial<LearningQuiz>) =>
    api.patch(`/learning/modules/${moduleId}/lessons/${lessonId}/quizzes/${quizId}`, data).then((r) => r.data),
  deleteQuiz: (moduleId: string, lessonId: string, quizId: string) =>
    api.delete(`/learning/modules/${moduleId}/lessons/${lessonId}/quizzes/${quizId}`),

  // Enrollments
  enrollUsers: (moduleId: string, userIds: string[], dueDate?: string) =>
    api.post(`/learning/modules/${moduleId}/enroll`, { userIds, dueDate }).then((r) => r.data),
  selfEnroll: (moduleId: string) =>
    api.post<LearningEnrollment>(`/learning/modules/${moduleId}/self-enroll`).then((r) => r.data),
  getEnrollments: (moduleId: string) =>
    api.get<LearningEnrollment[]>(`/learning/modules/${moduleId}/enrollments`).then((r) => r.data),

  // Learner
  getMyModules: () =>
    api.get<(LearningEnrollment & { module: LearningModule & { _count: { lessons: number } }; _count: { progress: number } })[]>('/learning/my-modules').then((r) => r.data),
  getMyProgress: (moduleId: string) =>
    api.get(`/learning/my-modules/${moduleId}/progress`).then((r) => r.data),
  updateProgress: (lessonId: string, enrollmentId: string, data: {
    status?: string;
    timeSpentSec?: number;
    videoPosition?: number;
    quizScore?: number;
    quizAttempts?: number;
    quizAnswers?: number[];
  }) =>
    api.patch<LessonProgress>(`/learning/progress/${lessonId}`, { ...data, enrollmentId }).then((r) => r.data),

  // Analytics
  getAnalytics: () => api.get<LearningAnalytics>('/learning/analytics').then((r) => r.data),
  getModuleAnalytics: (moduleId: string) =>
    api.get(`/learning/analytics/${moduleId}`).then((r) => r.data),

  // PDF Import
  importPdf: (file: File, departmentId?: string) => {
    const fd = new FormData();
    fd.append('pdf', file);
    if (departmentId) fd.append('departmentId', departmentId);
    return api.post<{ moduleId: string; title: string }>('/learning/modules/import-pdf', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },
};
