const apiKey = process.env.TMDB_API_KEY;
fetch(`https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&query=${encodeURIComponent("how many season is lioness tv show?")}&include_adult=false`)
  .then(res => res.json())
  .then(data => console.log(data.total_results));
