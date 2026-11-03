// Fletcher (a Typst package): the plain TikZ mode's boxes and arrows, written for Typst. Its canvas, rail and
// inspector are the TikZ mode's, so only the code is its own; it lives in the backend's latex/flowchart.js, which the
// converter uses too, to write a TikZ drawing again as fletcher.
export { fletcherCode, fletcherFor } from '../../../../../backend/src/latex/flowchart.js';
