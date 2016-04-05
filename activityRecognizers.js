var url = require('url')


function longest(steps, count){
  return steps.concat().sort(
    (a,b) => (b[1]-b[0])-(a[1]-a[0])
  ).slice(0,count)
}


// TODO: indirect should not count subdomains

export default {
  indirect: {
    filter(steps, trail){
      let host = url.parse(trail.blameUrl).host
      return steps.filter(s => s[3].indexOf(host) == -1)
    },
    describe(steps, trail){
      let topTitles = longest(steps, 3).map(s => s[4]).join(', ')
      return {
        verbPhrase: "visiting links",
        examples: topTitles
      }
    }
  },

  remaining: {
    filter(steps){
      return steps
    },
    describe(steps, trail){
      let topTitles = longest(steps, 3).map(s => s[4]).join(', ')
      return {
        verbPhrase: "using the site",
        examples: topTitles
      }
    }
  }
}
