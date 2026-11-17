// The handbook keeps its own copy of the app's palette (docs/handbook/palette.json), so it compiles as a project on
// its own: the two must stay the same.
import app from './palette.json';
import book from '../../../../docs/handbook/palette.json';

if (JSON.stringify(book) !== JSON.stringify(app)) {
  throw new Error('docs/handbook/palette.json differs from apps/frontend/src/app/palette.json: copy the app’s over it');
}
console.log('palette: the handbook’s copy matches the app’s');
