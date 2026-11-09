// Keep Wrangler's OAuth configuration in ignored local state when the host profile
// cannot be written. Never package this directory or print its credentials.
import {spawn} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {configureToolEnvironment} from '../scripts/tool-environment.mjs';
const root=resolve(import.meta.dirname,'..');
configureToolEnvironment(root);
const configRoot=resolve(root,'.sites-runtime/cloudflare-config');
mkdirSync(configRoot,{recursive:true});
const child=spawn(process.execPath,[resolve(root,'node_modules/wrangler/bin/wrangler.js'),...process.argv.slice(2)],{cwd:root,stdio:'inherit',windowsHide:true,env:{...process.env,XDG_CONFIG_HOME:configRoot}});
child.on('exit',code=>process.exitCode=code??1);
