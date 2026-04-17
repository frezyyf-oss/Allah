import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";


export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";
  const githubPagesBase =
    repositoryName && !repositoryName.endsWith(".github.io")
      ? `/${repositoryName}/`
      : "/";

  return {
    plugins: [react()],
    base: env.VITE_PUBLIC_BASE || githubPagesBase,
  };
});
