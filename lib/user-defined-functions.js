import moment from "moment";
//import logger from "../config/winston.js";

////////////user-defined functions/////////
/**
 *
 * @param {string} dobString
 */
function calculate_age(dobString) {
  let dob = new Date(dobString);
  var diff_ms = Date.now() - dob.getTime();
  var age_dt = new Date(diff_ms);

  return Math.abs(age_dt.getUTCFullYear() - 1970);
}

/**
 * 
 * @param {Array} arr1 Array to be filtered
 * @param {Array} arr2 Array for comparison
 * @returns {Array} array with all elements of arr1 which are not in arr2
 */
function arr_diff_nonSymm(arr1, arr2) {
  arr1 = Array.isArray(arr1) ? arr1 : [arr1];
  arr2 = Array.isArray(arr2) ? arr2 : [arr2];

  return arr1.filter(x => !arr2.includes(x));
}

/**
 * Union of 2 arrays with no duplicates
 * @param {Array} arr1 First array
 * @param {Array} arr2 Second Array
 * @returns Array concatenating arr1 and arr2 while descarding duplicates.
 */
function arr_union(arr1, arr2) {
  arr1 = Array.isArray(arr1) ? arr1 : [arr1];
  arr2 = Array.isArray(arr2) ? arr2 : [arr2];

  return Array.from( new Set([...arr1,...arr2]));
}

/**
 * Symmetric difference
 * @param {Array} a1 Array with elements to be 'susbtructed' from main array
 * @param {Array} a2 Array to be applied the action of difference
 * @returns 
 */
function arr_diff (a1, a2) {
  a1 = Array.isArray(a1) ? a1 : [a1];
  a2 = Array.isArray(a2) ? a2 : [a2];
  
  var a = [], diff = [];

  for (var i = 0; i < a1.length; i++) {
      a[a1[i]] = true;
  }

  for (var i = 0; i < a2.length; i++) {
      if (a[a2[i]]) {
          delete a[a2[i]];
      } else {
          a[a2[i]] = true;
      }
  }

  for (var k in a) {
      diff.push(k);
  }

  return diff;
}

/**
 *
 * @param {string} dateTime dateTime for comparison
 */
function getYearsFromNow(dateTime) {
  let prevDate = moment(dateTime);
  let currDate = moment();
  return currDate.diff(prevDate, "years", true);
}

export  {calculate_age, arr_diff_nonSymm, arr_diff, getYearsFromNow, arr_union};