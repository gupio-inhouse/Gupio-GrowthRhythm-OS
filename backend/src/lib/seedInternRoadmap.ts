import prisma from './prisma';
import quizData from '../../prisma/internRoadmapQuizzes.json';

type QuizQuestion = { question: string; options: string[]; correctIndex: number; explanation: string };
type QuizGroup = { track: string; phaseTitle: string; groupTitle: string; questions: QuizQuestion[] };

const QUIZZES = quizData as QuizGroup[];

function quizFor(track: string, phaseTitle: string, groupTitle: string): QuizQuestion[] {
  const group = QUIZZES.find((g) => g.track === track && g.phaseTitle === phaseTitle && g.groupTitle === groupTitle);
  if (!group) throw new Error(`No quiz data for ${track} / ${phaseTitle} / ${groupTitle}`);
  return group.questions;
}

interface TopicGroup {
  title: string;
  dayStart: number;
  dayEnd: number;
  topics: string[];
}

interface Phase {
  title: string;
  phaseNumber: number;
  color: string;
  dayStart: number;
  dayEnd: number;
  groups: TopicGroup[];
  checkpoint: string[];
}

interface Track {
  moduleTitle: string;
  quizTrackKey: string;
  description: string;
  durationDays: number;
  phases: Phase[];
}

const TRACKS: Track[] = [
  {
    moduleTitle: 'Frontend Engineer (Intern Roadmap)',
    quizTrackKey: 'Frontend Engineer',
    description:
      'Builds the interfaces users touch — from semantic markup and responsive layout to production React and cross-platform mobile apps. Core stack: HTML, CSS, Tailwind CSS, JavaScript + TypeScript, React, React Native.',
    durationDays: 30,
    phases: [
      {
        title: 'Foundation',
        phaseNumber: 1,
        color: '#3b82f6',
        dayStart: 1,
        dayEnd: 7,
        groups: [
          {
            title: 'Web fundamentals',
            dayStart: 1,
            dayEnd: 3,
            topics: ['How the internet works', 'DNS & domains', 'HTTP / HTTPS', 'HTTP methods & status codes', 'Client vs server', 'Browser rendering & the DOM', 'Critical rendering path', 'Semantic HTML5', 'Document structure & metadata', 'Forms, inputs & validation', 'Media & images', 'Tables & lists', 'Accessibility (ARIA, alt, labels)', 'SEO basics', 'Meta tags & favicons'],
          },
          {
            title: 'CSS fundamentals',
            dayStart: 4,
            dayEnd: 6,
            topics: ['Syntax & selectors', 'Specificity & the cascade', 'Box model', 'Display & visibility', 'Positioning', 'Flexbox', 'CSS Grid', 'Units (px/rem/em/%/vw)', 'Colours & gradients', 'Typography & web fonts', 'Spacing & sizing', 'Responsive design', 'Media queries', 'Pseudo-classes & elements', 'Transitions', 'Transforms', 'Animations & keyframes', 'Custom properties', 'Overflow & z-index'],
          },
          {
            title: 'Dev environment',
            dayStart: 7,
            dayEnd: 7,
            topics: ['VS Code & extensions', 'Terminal & shell basics', 'Git basics', 'GitHub (clone, branch, PR)', 'npm / pnpm / yarn', 'Chrome DevTools', 'Browser debugging', 'Project structure'],
          },
        ],
        checkpoint: [
          'Build a responsive, multi-section landing page using semantic HTML with Flexbox and Grid.',
          'Pass a basic accessibility audit — alt text, labels, keyboard focus, colour contrast.',
          'Clone a repo, branch, commit, and open a clean pull request.',
        ],
      },
      {
        title: 'Core',
        phaseNumber: 2,
        color: '#10b981',
        dayStart: 8,
        dayEnd: 16,
        groups: [
          {
            title: 'JavaScript deep dive',
            dayStart: 8,
            dayEnd: 11,
            topics: ['Variables & scope', 'Data types & coercion', 'Operators', 'Conditionals & loops', 'Functions & arrow functions', 'Closures', 'this & binding', 'Objects & prototypes', 'Arrays & array methods', 'Destructuring & spread', 'Template literals', 'ES modules', 'Promises', 'async/await', 'Fetch & APIs', 'JSON', 'Error handling (try/catch)', 'The event loop', 'DOM manipulation', 'Events & delegation', 'Web storage', 'Regular expressions'],
          },
          {
            title: 'TypeScript',
            dayStart: 12,
            dayEnd: 13,
            topics: ['Basic types', 'Interfaces & type aliases', 'Union & intersection types', 'Enums', 'Generics', 'Type narrowing & guards', 'Utility types', 'Typing functions', 'Typing objects & arrays', 'Type inference', 'tsconfig', 'Declaration files'],
          },
          {
            title: 'Tailwind CSS',
            dayStart: 14,
            dayEnd: 15,
            topics: ['Utility-first workflow', 'Core utilities', 'Responsive design', 'State variants (hover/focus)', 'Dark mode', 'Theme customization', 'Config file', 'Reusable components (@apply)', 'Plugins', 'JIT engine'],
          },
          {
            title: 'Tooling & build',
            dayStart: 16,
            dayEnd: 16,
            topics: ['Vite', 'Webpack basics', 'Bundling & modules', 'ESLint', 'Prettier', 'package.json & scripts', 'Environment variables', 'Hot module reload'],
          },
        ],
        checkpoint: [
          'Build an interactive app in vanilla JS that consumes a public API (fetch, async/await).',
          'Convert a JS module to TypeScript with typed functions and interfaces.',
          'Rebuild a UI with Tailwind including responsive and dark-mode variants.',
        ],
      },
      {
        title: 'Specialization',
        phaseNumber: 3,
        color: '#c2410c',
        dayStart: 17,
        dayEnd: 25,
        groups: [
          {
            title: 'React core',
            dayStart: 17,
            dayEnd: 19,
            topics: ['JSX', 'Components', 'Props', 'State (useState)', 'Rendering & re-renders', 'Lists & keys', 'Conditional rendering', 'Event handling', 'Controlled forms', 'useEffect', 'useRef', 'Effects & cleanup', 'Fragments', 'Portals'],
          },
          {
            title: 'React advanced',
            dayStart: 20,
            dayEnd: 21,
            topics: ['Custom hooks', 'useMemo & useCallback', 'useReducer', 'Context API', 'useContext', 'Performance & memoization', 'Error boundaries', 'Code splitting & lazy', 'Suspense', 'Compound components', 'Render props', 'Higher-order components'],
          },
          {
            title: 'React ecosystem',
            dayStart: 22,
            dayEnd: 23,
            topics: ['React Router', 'Data fetching (React Query / SWR)', 'State management (Zustand / Redux Toolkit)', 'Forms (React Hook Form)', 'Styling (CSS Modules / styled-components)', 'Testing (Jest, RTL)', 'Storybook'],
          },
          {
            title: 'React Native',
            dayStart: 24,
            dayEnd: 25,
            topics: ['Core components', 'Styling & Flexbox', 'Navigation (React Navigation)', 'Lists (FlatList)', 'Touch & gestures', 'Native APIs', 'Platform-specific code', 'Async storage', 'Expo workflow', 'Push notifications', 'Debugging & performance', 'Publishing to stores'],
          },
        ],
        checkpoint: [
          'Ship a React app with routing, forms, and server data via React Query.',
          'Write component and custom-hook tests with React Testing Library.',
          'Build a working React Native screen with navigation.',
        ],
      },
      {
        title: 'Mastery',
        phaseNumber: 4,
        color: '#8b5cf6',
        dayStart: 26,
        dayEnd: 30,
        groups: [
          {
            title: 'Architecture & patterns',
            dayStart: 26,
            dayEnd: 27,
            topics: ['Component design patterns', 'Design systems', 'Atomic design', 'Monorepos (Turborepo / Nx)', 'Folder architecture', 'State architecture', 'Type-safe APIs (tRPC)'],
          },
          {
            title: 'Performance',
            dayStart: 28,
            dayEnd: 28,
            topics: ['Core Web Vitals', 'Lazy loading & code splitting', 'Image optimization', 'Memoization', 'Bundle analysis', 'Rendering strategies', 'Caching'],
          },
          {
            title: 'Quality & testing',
            dayStart: 29,
            dayEnd: 29,
            topics: ['Unit testing', 'Integration testing', 'E2E (Playwright / Cypress)', 'Visual regression', 'WCAG accessibility', 'Linting & CI'],
          },
          {
            title: 'Production & frameworks',
            dayStart: 30,
            dayEnd: 30,
            topics: ['Next.js (SSR / SSG / ISR)', 'CI/CD for frontend', 'Error monitoring (Sentry)', 'Feature flags', 'PWA & offline', 'Web security (XSS / CSRF / CSP)', 'Analytics'],
          },
        ],
        checkpoint: [
          'Set up CI/CD and error monitoring for a frontend project.',
          'Hit target Core Web Vitals on a real page and prove the improvement.',
          'Contribute a tested, reusable component to a shared design system.',
        ],
      },
    ],
  },
  {
    moduleTitle: 'Backend Engineer (Intern Roadmap)',
    quizTrackKey: 'Backend Engineer',
    description:
      'Designs the APIs, data models, and services that power products — across Node, NestJS, and Python, backed by SQL and NoSQL databases. Core stack: JavaScript + TypeScript, Node.js/Express, NestJS, Python + FastAPI, PostgreSQL + Prisma, MongoDB.',
    durationDays: 30,
    phases: [
      {
        title: 'Foundation',
        phaseNumber: 1,
        color: '#3b82f6',
        dayStart: 1,
        dayEnd: 7,
        groups: [
          {
            title: 'Programming core',
            dayStart: 1,
            dayEnd: 3,
            topics: ['Variables & types', 'Control flow', 'Functions & scope', 'Closures', 'Objects & arrays', 'JS + TS fundamentals', 'Async programming', 'Promises & async/await', 'Error handling', 'Modules & imports', 'npm packages', 'Data structures', 'Algorithms basics', 'Big-O basics', 'Recursion'],
          },
          {
            title: 'How backends work',
            dayStart: 4,
            dayEnd: 5,
            topics: ['Client–server model', 'HTTP methods', 'Status codes', 'Headers', 'REST principles', 'Request lifecycle', 'JSON & serialization', 'URLs & query params', 'Cookies & sessions', 'Statelessness', 'Env & config', 'Postman / Insomnia', 'curl'],
          },
          {
            title: 'Command line & OS',
            dayStart: 6,
            dayEnd: 7,
            topics: ['Linux basics', 'File system & permissions', 'Shell commands', 'Bash scripting basics', 'Processes & signals', 'Environment variables', 'SSH', 'Git & version control'],
          },
        ],
        checkpoint: [
          'Explain the request/response lifecycle and REST in your own words.',
          'Write TypeScript with typed async functions and robust error handling.',
          'Solve foundational data-structure and algorithm problems.',
        ],
      },
      {
        title: 'Core',
        phaseNumber: 2,
        color: '#10b981',
        dayStart: 8,
        dayEnd: 17,
        groups: [
          {
            title: 'Node.js & Express',
            dayStart: 8,
            dayEnd: 11,
            topics: ['Runtime & event loop', 'npm & modules', 'Building REST APIs', 'Routing', 'Route & query params', 'Middleware', 'Body parsing', 'Validation (Zod / Joi)', 'Error middleware', 'Auth (JWT)', 'Sessions & cookies', 'Password hashing (bcrypt)', 'Authorization & roles', 'CORS', 'File uploads (Multer)', 'Env variables (dotenv)', 'Logging'],
          },
          {
            title: 'Databases — SQL',
            dayStart: 12,
            dayEnd: 14,
            topics: ['Relational modeling', 'Normalization', 'Data types', 'CRUD operations', 'SELECT & filtering', 'Joins', 'Aggregation & grouping', 'Subqueries', 'Indexes', 'Constraints & keys', 'Transactions & ACID', 'PostgreSQL', 'Prisma schema', 'Prisma Client', 'Relations', 'Migrations'],
          },
          {
            title: 'Databases — NoSQL',
            dayStart: 15,
            dayEnd: 17,
            topics: ['Document model', 'Collections & documents', 'MongoDB CRUD', 'Query operators', 'Aggregation pipeline', 'Indexes', 'Schema design', 'Mongoose', 'Schemas & models', 'Population', 'SQL vs NoSQL', 'Redis basics'],
          },
        ],
        checkpoint: [
          'Build a CRUD REST API in Express with JWT auth and request validation.',
          'Model and query a PostgreSQL database via Prisma with relations and migrations.',
          'Model the same domain in MongoDB and justify a SQL-vs-NoSQL choice.',
        ],
      },
      {
        title: 'Specialization',
        phaseNumber: 3,
        color: '#c2410c',
        dayStart: 18,
        dayEnd: 26,
        groups: [
          {
            title: 'NestJS',
            dayStart: 18,
            dayEnd: 21,
            topics: ['Architecture & modules', 'Controllers', 'Providers & services', 'Dependency injection', 'DTOs', 'Validation (class-validator)', 'Pipes', 'Guards', 'Interceptors', 'Middleware', 'Exception filters', 'Auth (Passport / JWT)', 'Authorization (RBAC)', 'Config module', 'ORM integration', 'Swagger', 'Testing (unit & e2e)', 'Microservices'],
          },
          {
            title: 'Python + FastAPI',
            dayStart: 22,
            dayEnd: 24,
            topics: ['Python fundamentals', 'Type hints', 'Virtual environments', 'pip & poetry', 'Pydantic models', 'FastAPI routing', 'Path & query params', 'Request bodies', 'Response models', 'Dependency injection', 'Async endpoints', 'Auth (OAuth2 / JWT)', 'SQLAlchemy', 'Alembic migrations', 'Background tasks', 'Testing (pytest)'],
          },
          {
            title: 'API design',
            dayStart: 25,
            dayEnd: 26,
            topics: ['REST best practices', 'Resource naming', 'Pagination', 'Filtering & sorting', 'Versioning', 'OpenAPI / Swagger', 'Error responses', 'Rate limiting', 'Idempotency', 'GraphQL basics', 'WebSockets', 'Caching (Redis)', 'API keys & auth'],
          },
        ],
        checkpoint: [
          'Build a modular NestJS service with DI, guards, and DTO validation.',
          'Build a FastAPI service with pydantic models and database integration.',
          'Document an API with OpenAPI and add caching plus rate limiting.',
        ],
      },
      {
        title: 'Mastery',
        phaseNumber: 4,
        color: '#8b5cf6',
        dayStart: 27,
        dayEnd: 30,
        groups: [
          {
            title: 'Architecture',
            dayStart: 27,
            dayEnd: 28,
            topics: ['Clean / layered architecture', 'Domain-driven design', 'SOLID principles', 'Monolith vs microservices', 'Service communication', 'Message queues (Kafka / RabbitMQ)', 'Event-driven architecture', 'CQRS basics', 'WebSockets & real-time', 'Caching strategies', 'Replication & sharding', 'Load balancing'],
          },
          {
            title: 'Production & DevOps',
            dayStart: 29,
            dayEnd: 30,
            topics: ['Logging & monitoring', 'Observability', 'Unit & integration testing', 'E2E testing', 'Security (OWASP Top 10)', 'Input sanitization', 'Secrets management', 'Rate limiting & throttling', 'Dockerizing services', 'CI/CD pipelines', 'Performance profiling', 'Database tuning'],
          },
        ],
        checkpoint: [
          'Design and justify an architecture (mono vs micro) for a real feature.',
          'Add an async workflow using a message queue.',
          'Containerize a service and wire up CI/CD with tests and logging.',
        ],
      },
    ],
  },
];

async function main() {
  const org = await prisma.organization.findFirst();
  if (!org) throw new Error('No organization found — run the main seed first.');

  const owner = await prisma.user.findFirst({ where: { orgId: org.id, role: 'OWNER' } });
  if (!owner) throw new Error('No OWNER user found in organization — cannot set createdById.');

  for (const track of TRACKS) {
    const existing = await prisma.learningModule.findFirst({ where: { orgId: org.id, title: track.moduleTitle } });
    if (existing) {
      console.log(`Skipping "${track.moduleTitle}" — already exists (id ${existing.id}).`);
      continue;
    }

    const module = await prisma.learningModule.create({
      data: {
        orgId: org.id,
        createdById: owner.id,
        title: track.moduleTitle,
        description: track.description,
        type: 'SKILLS',
        isPublished: false,
        isMandatory: false,
        passScore: 70,
        durationDays: track.durationDays,
      },
    });

    let lessonOrder = 0;

    for (const phase of track.phases) {
      const createdPhase = await prisma.learningPhase.create({
        data: {
          moduleId: module.id,
          title: phase.title,
          phaseNumber: phase.phaseNumber,
          color: phase.color,
          dayStart: phase.dayStart,
          dayEnd: phase.dayEnd,
          order: phase.phaseNumber - 1,
        },
      });

      for (const group of phase.groups) {
        const lesson = await prisma.learningLesson.create({
          data: {
            moduleId: module.id,
            phaseId: createdPhase.id,
            title: group.title,
            contentType: 'VIDEO',
            contentUrl: null,
            notesUrl: null,
            topics: group.topics,
            dayStart: group.dayStart,
            dayEnd: group.dayEnd,
            order: lessonOrder++,
            isRequired: true,
          },
        });

        const questions = quizFor(track.quizTrackKey, phase.title, group.title);
        for (let qi = 0; qi < questions.length; qi++) {
          const q = questions[qi];
          await prisma.learningQuiz.create({
            data: {
              lessonId: lesson.id,
              question: q.question,
              options: q.options,
              correctAnswer: q.correctIndex,
              explanation: q.explanation,
              points: 1,
              order: qi,
            },
          });
        }
      }

      await prisma.learningLesson.create({
        data: {
          moduleId: module.id,
          phaseId: createdPhase.id,
          title: `Checkpoint — ${phase.title}`,
          contentType: 'CHECKPOINT',
          contentBody: `Close out the ${phase.title} phase by demonstrating these outcomes on a real task.`,
          checkpointItems: phase.checkpoint,
          dayStart: phase.dayStart,
          dayEnd: phase.dayEnd,
          order: lessonOrder++,
          isRequired: true,
        },
      });
    }

    console.log(`Created "${track.moduleTitle}" (${module.id}) — ${track.phases.length} phases, unpublished.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
