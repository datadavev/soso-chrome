import gulp from 'gulp'
import { clean, scripts, styles, markup, images, manifest, watch, bundle } from './tasks'
import dotenv from 'dotenv'
dotenv.config();


export const paths = {
  scripts: [
    'src/common.js',
    'src/options.js',
    'src/content.js',
    'src/background.js',
    'src/popup.js'
  ],

  styles: [
    'src/options.scss',
    'src/popup.scss',
    'node_modules/spectre.css/dist/spectre.css',
    'node_modules/spectre.css/dist/spectre-exp.css',
    'node_modules/spectre.css/dist/spectre-icons.css',
  ],

  images: 'src/images/**/*',

  manifest: 'src/manifest.json',

  markup: [
    'src/options.html',
    'src/popup.html'
  ],
};


gulp.task('build', gulp.series(clean, gulp.parallel(scripts, styles, markup, images, manifest)));
gulp.task('dev', gulp.series('build', watch));
gulp.task('bundle', gulp.series('build', bundle));
gulp.task('clean', gulp.series(clean));
