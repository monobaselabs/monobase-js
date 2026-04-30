import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: '../../specs/api/dist/openapi/openapi.json',
  output: {
    path: 'src/generated',
    clean: true,
  },
  plugins: [
    {
      name: '@hey-api/client-fetch',
      runtimeConfigPath: './src/client',
    },
    '@hey-api/typescript',
    {
      name: '@hey-api/transformers',
      dates: true,
    },
    {
      name: '@hey-api/sdk',
      transformer: true,
    },
    {
      name: '@tanstack/react-query',
      queryOptions: true,
      mutationOptions: true,
      infiniteQueryOptions: true,
    },
  ],
});
