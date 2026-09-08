const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const isWatch = process.argv.includes('--watch');

const distDir = path.resolve(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

function copyUI() {
  const uiSrc = path.resolve(__dirname, 'src/ui.html');
  const uiDist = path.resolve(__dirname, 'dist/ui.html');
  if (fs.existsSync(uiSrc)) {
    fs.copyFileSync(uiSrc, uiDist);
    console.log('[build] Copied src/ui.html -> dist/ui.html');
  }
}

async function run() {
  copyUI();

  const ctx = await esbuild.context({
    entryPoints: ['src/code.ts'],
    bundle: true,
    outfile: 'dist/code.js',
    target: 'es2020',
    platform: 'browser',
    minify: !isWatch,
    sourcemap: isWatch ? 'inline' : false,
    logLevel: 'info'
  });

  if (isWatch) {
    console.log('[build] Watching for changes...');
    fs.watch(path.resolve(__dirname, 'src/ui.html'), () => {
      copyUI();
    });
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    console.log('[build] Build completed successfully.');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
