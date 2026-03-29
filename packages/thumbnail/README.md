# Thumbnail Package

`packages/thumbnail` contains thumbnail generation and job-processing logic:

- theme thumbnail generation
- preview capture planning
- thumbnail job claiming and processing
- worker-facing helpers

It still depends on shared storage helpers in `lib/storage.ts`.
