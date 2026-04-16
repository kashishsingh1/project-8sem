# Component Patterns

Standardized patterns for building high-performance, maintainable React components.

## 1. Functional Components with `React.FC`

Always use `React.FC<Props>` for type-safe components. This ensures children are typed correctly and provides consistency.

```typescript
import React from 'react';

interface ButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

export const Button: React.FC<ButtonProps> = ({ label, onClick, variant = 'primary' }) => {
  return (
    <button className={`btn btn-${variant}`} onClick={onClick}>
      {label}
    </button>
  );
};

export default Button;
```

## 2. Code Splitting & Lazy Loading

For any component that is heavy (e.g., DataGrid, Charts, heavy Modals), use `React.lazy`.

```typescript
import React, { Suspense, lazy } from 'react';
import SuspenseLoader from '@/components/SuspenseLoader';

const HeavyChart = lazy(() => import('./HeavyChart'));

export const Dashboard: React.FC = () => {
  return (
    <Suspense fallback={<SuspenseLoader />}>
      <HeavyChart />
    </Suspense>
  );
};
```

## 3. Strict Props Interfaces

Avoid `any`. Define strictly what the component needs. Use `import type` to keep bundle sizes small.

## 4. No Early Returns for Loading

Early returns for loading states (e.g., `if (isLoading) return <Loading />`) cause layout shifts. Use **Suspense boundaries** instead to keep the layout stable.
