import type { LayoutServerLoad } from './$types';
import { projectVersion } from '$lib/server/project';

export const load: LayoutServerLoad = async () => ({ version: projectVersion() });
