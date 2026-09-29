import * as github from "@actions/github";
import {
  ARTIFACTS_NAME_PREFIX_FOR_CACHE_KEY,
  ACTIONSFLOW_LAST_CACHE_KEY,
} from "../constant";
import * as core from "@actions/core";
import getSecrets from "./secrets";
import { getCacheKeyPrefix } from "./cache";

export default async function exportLastCacheKeyEnv(): Promise<{
  ACTIONSFLOW_LAST_CACHE_KEY: string;
}> {
  const context = github.context;
  const secrets = getSecrets();
  const token = secrets.GITHUB_TOKEN;

  const octokit = github.getOctokit(token);
  let cacheKey = "";

  try {
    const result = await octokit.rest.actions.listArtifactsForRepo({
      owner: context.repo.owner,
      repo: context.repo.repo,
    });
    if (result && result.data && result.data.artifacts) {
      const artifacts = result.data.artifacts;
      for (let i = 0; i < artifacts.length; i++) {
        const name = artifacts[i].name;
        if (name.startsWith(ARTIFACTS_NAME_PREFIX_FOR_CACHE_KEY)) {
          cacheKey = name.slice(ARTIFACTS_NAME_PREFIX_FOR_CACHE_KEY.length);
          break;
        }
      }
    }
  } catch (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    error: any
  ) {
    const status = error?.status;
    if (typeof status !== "number" || status < 500 || status >= 600) {
      throw error;
    }

    core.warning(
      `listArtifactsForRepo failed with HTTP ${status}; falling back to the Actions Cache API`,
    );

    const cacheResult = await octokit.request(
      "GET /repos/{owner}/{repo}/actions/caches",
      {
        owner: context.repo.owner,
        repo: context.repo.repo,
        key: getCacheKeyPrefix(),
        sort: "created_at",
        direction: "desc",
        per_page: 1,
      },
    );

    const actionsCaches = cacheResult.data.actions_caches;
    if (actionsCaches && actionsCaches.length > 0) {
      cacheKey = actionsCaches[0].key;
      core.info(`Recovered actionsflow cache key via Actions Cache API`);
    }
  }

  if (cacheKey) {
    core.debug(`export env ${ACTIONSFLOW_LAST_CACHE_KEY}: ${cacheKey}`);
    core.exportVariable(ACTIONSFLOW_LAST_CACHE_KEY, cacheKey);
  }
  return {
    [ACTIONSFLOW_LAST_CACHE_KEY]: cacheKey,
  };
}
