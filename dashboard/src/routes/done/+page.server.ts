import type { PageServerLoad } from './$types';
import { stackState } from '$lib/server/project';

export const load: PageServerLoad = async ({ url }) => {
  const rebuild = url.searchParams.get('rebuild') === '1';
  const first = url.searchParams.get('first') === '1';
  const { needBuild } = await stackState();
  // A build-affecting change, or the first configuration, requires a build even
  // when images already exist on the machine.
  return { rebuild, needBuild: rebuild || needBuild || first };
};
