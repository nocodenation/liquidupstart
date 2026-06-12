import type { PageServerLoad } from './$types';
import { stackState } from '$lib/server/project';

export const load: PageServerLoad = async ({ url }) => {
  const rebuild = url.searchParams.get('rebuild') === '1';
  const { needBuild } = await stackState();
  // A build-affecting change requires a rebuild even when images exist.
  return { rebuild, needBuild: rebuild || needBuild };
};
