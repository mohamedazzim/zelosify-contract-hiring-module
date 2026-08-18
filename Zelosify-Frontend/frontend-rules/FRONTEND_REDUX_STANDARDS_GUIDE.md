# Frontend Redux Standards Guide

## Overview

This document outlines the established patterns, standards, and structures for implementing Redux Toolkit in the Zelosify project. It serves as a comprehensive guide for maintaining consistency across all Redux implementations and for creating new features following the established conventions.

## Migration Philosophy

### Core Principles

1. **Backward Compatibility**: Maintain all existing functionality and UI behavior
2. **Clean Architecture**: Separate concerns between Redux logic and UI components
3. **Error Handling**: Implement comprehensive error handling in both slice and components
4. **Documentation**: Add detailed comments and maintain code readability
5. **DRY Principle**: Avoid code duplication and promote reusability
6. **Accessibility**: Ensure all UI/UX guidelines are followed

## File Structure and Organization

### Required Files for Each Module

```
frontend/src/
├── redux/features/[ModuleName]/
│   └── [moduleName]Slice.js
├── hooks/[ModuleName]/
│   └── use[ModuleName].js
├── components/[ComponentPath]/
│   └── [UpdatedComponents].jsx
└── utils/[ModuleName]/
    └── [moduleName]Utils.js (if needed)
```

### Naming Conventions

- **Slice Files**: `[moduleName]Slice.js` (camelCase)
- **Hook Files**: `use[ModuleName].js` (PascalCase for hook name)
- **Utility Files**: `[moduleName]Utils.js` (camelCase)
- **State Properties**: camelCase
- **Action Names**: camelCase
- **Thunk Names**: camelCase with descriptive verbs

## Redux Slice Structure

### Standard Slice Template

```javascript
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axiosInstance from '@/utils/axios/AxiosInstance';

// Async Thunks
export const fetch[ModuleName]Data = createAsyncThunk(
  '[moduleName]/fetch[ModuleName]Data',
  async (params, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.get('/api/endpoint', { params });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch data');
    }
  }
);

// Initial State
const initialState = {
  // Data states
  data: [],

  // UI states
  isLoading: false,
  error: null,

  // Filter/Configuration states (if applicable)
  filters: {},

  // Additional module-specific states
};

// Slice Definition
const [moduleName]Slice = createSlice({
  name: '[moduleName]',
  initialState,
  reducers: {
    // Synchronous actions
    clearError: (state) => {
      state.error = null;
    },
    reset[ModuleName]: (state) => {
      return initialState;
    },
    // Additional reducers as needed
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetch[ModuleName]Data.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetch[ModuleName]Data.fulfilled, (state, action) => {
        state.isLoading = false;
        state.data = action.payload;
      })
      .addCase(fetch[ModuleName]Data.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      });
  },
});

// Export actions
export const { clearError, reset[ModuleName] } = [moduleName]Slice.actions;

// Selectors
export const select[ModuleName]Data = (state) => state.[moduleName].data;
export const select[ModuleName]Loading = (state) => state.[moduleName].isLoading;
export const select[ModuleName]Error = (state) => state.[moduleName].error;

// Export reducer
export default [moduleName]Slice.reducer;
```

### Required State Properties

Every slice must include:

- `isLoading`: Boolean for async operation states
- `error`: String for error messages
- Data properties specific to the module
- Clear action for resetting error state
- Reset action for clearing entire state

## Custom Hook Structure

### Standard Hook Template

```javascript
import { useSelector, useDispatch } from 'react-redux';
import { useCallback, useRef } from 'react';
import {
  fetch[ModuleName]Data,
  clearError,
  reset[ModuleName],
  select[ModuleName]Data,
  select[ModuleName]Loading,
  select[ModuleName]Error,
} from '@/redux/features/[ModuleName]/[moduleName]Slice';

/**
 * Custom hook for managing [module name] state and operations
 *
 * @returns {Object} Hook interface with state and handlers
 */
const use[ModuleName] = () => {
  const dispatch = useDispatch();
  const hasFetchedRef = useRef(false);

  // Selectors
  const data = useSelector(select[ModuleName]Data);
  const isLoading = useSelector(select[ModuleName]Loading);
  const error = useSelector(select[ModuleName]Error);

  /**
   * Fetch [module name] data with duplicate request prevention
   */
  const handleFetch[ModuleName]Data = useCallback(async (params = {}) => {
    if (hasFetchedRef.current && !params.forceRefresh) return;

    try {
      await dispatch(fetch[ModuleName]Data(params)).unwrap();
      hasFetchedRef.current = true;
    } catch (error) {
      console.error('Failed to fetch [module name] data:', error);
    }
  }, [dispatch]);

  /**
   * Clear error state
   */
  const handleClearError = useCallback(() => {
    dispatch(clearError());
  }, [dispatch]);

  /**
   * Reset [module name] state
   */
  const handleReset[ModuleName] = useCallback(() => {
    dispatch(reset[ModuleName]());
    hasFetchedRef.current = false;
  }, [dispatch]);

  return {
    // State
    data,
    isLoading,
    error,

    // Actions
    handleFetch[ModuleName]Data,
    handleClearError,
    handleReset[ModuleName],

    // Utility functions (if needed)
  };
};

export default use[ModuleName];
```

### Required Hook Features

Every hook must provide:

- State selectors for data, loading, and error
- Fetch handler with duplicate request prevention
- Error clearing handler
- State reset handler
- Detailed JSDoc comments
- Memoized callbacks using `useCallback`

## Component Integration Pattern

### Data Fetching in Components

```javascript
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import use[ModuleName] from '@/hooks/[ModuleName]/use[ModuleName]';

const [Component] = () => {
  const pathname = usePathname();
  const {
    data,
    isLoading,
    error,
    handleFetch[ModuleName]Data,
    handleClearError
  } = use[ModuleName]();

  // Fetch data only on correct route
  useEffect(() => {
    if (pathname === '/target-route') {
      handleFetch[ModuleName]Data();
    }
  }, [pathname, handleFetch[ModuleName]Data]);

  // Error handling
  useEffect(() => {
    if (error) {
      console.error('[Module Name] Error:', error);
      // Handle error display
    }
  }, [error]);

  if (isLoading) return <LoadingComponent />;
  if (error) return <ErrorComponent error={error} onRetry={handleClearError} />;

  return (
    // Component JSX
  );
};
```

## Error Handling Standards

### In Redux Slices

```javascript
// Async thunk error handling
export const fetch[ModuleName]Data = createAsyncThunk(
  '[moduleName]/fetch[ModuleName]Data',
  async (params, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.get('/api/endpoint', { params });
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message ||
        error.message ||
        'Failed to fetch [module name] data'
      );
    }
  }
);

// Reducer error handling
.addCase(fetch[ModuleName]Data.rejected, (state, action) => {
  state.isLoading = false;
  state.error = action.payload;
});
```

### In Components

```javascript
// Error display and recovery
if (error) {
  return (
    <ErrorComponent
      message={error}
      onRetry={() => {
        handleClearError();
        handleFetch[ModuleName]Data({ forceRefresh: true });
      }}
    />
  );
}
```

## Store Integration

### Adding New Reducer to Store

```javascript
// frontend/src/redux/store.js
import { configureStore } from '@reduxjs/toolkit';
import [moduleName]Reducer from './features/[ModuleName]/[moduleName]Slice';

export const store = configureStore({
  reducer: {
    // Existing reducers
    auth: authReducer,
    tracking: trackingReducer,
    headerMetrics: headerMetricsReducer,

    // New reducer
    [moduleName]: [moduleName]Reducer,
  },
});
```

## Utility Functions Integration

### Utility File Structure

```javascript
// frontend/src/utils/[ModuleName]/[moduleName]Utils.js

/**
 * Pure utility functions for [module name] operations
 * These functions should not have side effects and should be easily testable
 */

/**
 * Process raw API data into component-ready format
 * @param {Array} rawData - Raw data from API
 * @returns {Array} Processed data
 */
export const processData = (rawData) => {
  // Processing logic
  return processedData;
};

/**
 * Format data for specific display purposes
 * @param {Object} data - Data to format
 * @returns {Object} Formatted data
 */
export const formatForDisplay = (data) => {
  // Formatting logic
  return formattedData;
};

// Additional utility functions as needed
```

### Using Utilities in Redux

```javascript
// In slice extraReducers
.addCase(fetch[ModuleName]Data.fulfilled, (state, action) => {
  state.isLoading = false;
  state.data = processData(action.payload);
});
```

## Testing Checklist

### Pre-Migration Testing

- [ ] Document existing functionality
- [ ] Identify all state dependencies
- [ ] Map out component interactions
- [ ] Note any special behaviors or edge cases

### Post-Migration Testing

- [ ] Data fetching works on correct routes
- [ ] Loading states display properly
- [ ] Error handling functions correctly
- [ ] All interactive elements work identically
- [ ] UI behavior matches pre-migration state
- [ ] No duplicate requests are made
- [ ] State persistence works as expected

## Common Patterns and Best Practices

### Duplicate Request Prevention

```javascript
const use[ModuleName] = () => {
  const hasFetchedRef = useRef(false);

  const handleFetch[ModuleName]Data = useCallback(async (params = {}) => {
    if (hasFetchedRef.current && !params.forceRefresh) return;

    try {
      await dispatch(fetch[ModuleName]Data(params)).unwrap();
      hasFetchedRef.current = true;
    } catch (error) {
      console.error('Failed to fetch data:', error);
    }
  }, [dispatch]);
};
```

### Route-Specific Data Fetching

```javascript
useEffect(() => {
  if (pathname === "/specific-route") {
    handleFetchData();
  }
}, [pathname, handleFetchData]);
```

### Selector Optimization

```javascript
// Create memoized selectors for computed values
export const selectProcessedData = createSelector(
  [selectRawData, selectFilters],
  (rawData, filters) => processData(rawData, filters)
);
```

## Documentation Standards

### Required Comments

1. **File Headers**: Describe the module's purpose
2. **Function Comments**: JSDoc format for all exported functions
3. **State Properties**: Describe each state property's purpose
4. **Complex Logic**: Explain non-obvious code sections
5. **API Integration**: Document endpoint usage and data structure

### Comment Examples

```javascript
/**
 * Redux slice for managing [module name] state and operations
 *
 * This slice handles:
 * - Data fetching from [API endpoint]
 * - Loading and error states
 * - [Additional functionalities]
 */

/**
 * Async thunk to fetch [module name] data from the backend
 *
 * @param {Object} params - Query parameters for the API call
 * @param {string} params.timeRange - Time range for data filtering
 * @returns {Promise} API response data
 */
```

## Migration Checklist

### Pre-Migration

- [ ] Review existing Context API implementation
- [ ] Identify all state variables and methods
- [ ] Map component dependencies
- [ ] Plan Redux slice structure
- [ ] Design custom hook interface

### During Migration

- [ ] Create Redux slice following template
- [ ] Implement custom hook with all required features
- [ ] Update components to use Redux
- [ ] Move utility functions to appropriate files
- [ ] Add comprehensive error handling
- [ ] Include detailed comments

### Post-Migration

- [ ] Test all functionality
- [ ] Remove old Context API files
- [ ] Update provider structure
- [ ] Verify no duplicate requests
- [ ] Confirm UI behavior matches original
- [ ] Update documentation

## Advanced Patterns

### Complex State Management

For modules with complex state interactions:

```javascript
// Use createSelector for derived state
export const selectFilteredData = createSelector(
  [selectData, selectFilters],
  (data, filters) => applyFilters(data, filters)
);

// Handle multiple related async operations
export const fetchRelatedData = createAsyncThunk(
  '[moduleName]/fetchRelatedData',
  async (_, { dispatch, getState }) => {
    const { primaryData } = getState().[moduleName];
    if (primaryData.length > 0) {
      // Fetch related data based on primary data
    }
  }
);
```

### Optimistic Updates

```javascript
// For immediate UI updates before API confirmation
const [moduleName]Slice = createSlice({
  name: '[moduleName]',
  initialState,
  reducers: {
    optimisticUpdate: (state, action) => {
      // Update state optimistically
      state.data = updateData(state.data, action.payload);
    },
    revertOptimisticUpdate: (state, action) => {
      // Revert if API call fails
      state.data = action.payload.previousData;
    },
  },
});
```

## Performance Considerations

1. **Memoization**: Use `createSelector` for computed values
2. **Shallow Comparison**: Use shallow equality checks in useSelector
3. **Batch Updates**: Group related state updates
4. **Lazy Loading**: Implement data fetching only when needed
5. **Memory Management**: Clean up subscriptions and refs

## Security Guidelines

1. **Input Validation**: Validate all user inputs before dispatch
2. **Error Messages**: Don't expose sensitive information in error messages
3. **API Keys**: Never store sensitive data in Redux state
4. **Data Sanitization**: Sanitize data before displaying

## Conclusion

This guide establishes the foundation for consistent Redux implementations across the Zelosify project. Following these standards ensures:

- Maintainable and readable code
- Consistent user experience
- Efficient state management
- Comprehensive error handling
- Easy debugging and testing

When creating new features or migrating existing modules, refer to this guide to maintain consistency with established patterns and ensure high-quality implementation.

---

**Last Updated**: July 2, 2025
**Version**: 1.0
**Maintainer**: Zelosify Core Development Team
