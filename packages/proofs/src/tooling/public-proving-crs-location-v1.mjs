/** Location only; each reader must still authenticate the complete public CRS. */
import {join} from 'node:path';
import {externalResourcesRoot,projectRoot,resourceMode} from '@lianum/environment';

// Portable candidates own their optional cache beneath resources. Climbing
// out of that root would collide with the repository's executable `dev` file.
export const publicProvingCRSCachePath = join(resourceMode==='candidate'
 ? externalResourcesRoot : join(projectRoot,'.internal/dev'),
 'cache/public-crs/full-v1/bn254_g1_full_uncompressed.dat');
