import { checkToolchain, run } from './check-toolchain.mjs';

checkToolchain();
run('cargo', ['fmt', '--check']);
run('cargo', ['clippy', '--locked', '--all-targets', '--', '-D', 'warnings']);
run('cargo', ['test', '--locked']);
