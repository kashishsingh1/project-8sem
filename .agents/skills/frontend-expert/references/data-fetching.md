# Data Fetching

Patterns for type-safe, performant data fetching using TanStack Query and Suspense.

## 1. useSuspenseQuery Pattern

This is the primary pattern for fetching data in this project. It eliminates the need for manual loading checks in your components.

```typescript
import { useSuspenseQuery } from '@tanstack/react-query';
import { projectApi } from '@/features/projects/api/projectApi';

export const ProjectList: React.FC = () => {
  const { data: projects } = useSuspenseQuery({
    queryKey: ['projects'],
    queryFn: projectApi.getProjects,
  });

  return (
    <ul>
      {projects.map(p => <li key={p.id}>{p.name}</li>)}
    </ul>
  );
};
```

## 2. API Service Layer

Never call `fetch` or `axios` directly in your components. Always use an abstraction in the feature's `api/` directory.

```typescript
// features/projects/api/projectApi.ts
import { apiClient } from '@/lib/apiClient';
import type { Project } from '../types/project';

export const projectApi = {
  getProjects: async (): Promise<Project[]> => {
    const { data } = await apiClient.get('/projects');
    return data;
  },
};
```

## 3. Cache Management

- Use descriptive `queryKey` arrays.
- Prefetch data for improved UX.
- Invalidate queries on mutations to keep the UI in sync.

```typescript
const qc = useQueryClient();
const mutation = useMutation({
  mutationFn: projectApi.createProject,
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ['projects'] });
  }
});
```
