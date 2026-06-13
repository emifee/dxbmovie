import type { Movie, ChatMessage, ChatSessionSummary } from "./types";

// Mock catalog for the UI build. Poster paths are real TMDB paths so the
// image.tmdb.org CDN (no API key required) renders actual artwork. When the
// TMDB integration lands, these arrays get replaced by live fetches and every
// component keeps working unchanged.

export const MOCK_MOVIES: Movie[] = [
  {
    id: 27205,
    title: "Inception",
    year: "2010",
    rating: 8.4,
    posterPath: "/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg",
    overview:
      "A thief who steals corporate secrets through dream-sharing technology is given the inverse task of planting an idea into the mind of a C.E.O.",
    genres: ["Action", "Sci-Fi", "Thriller"],
    cast: ["Leonardo DiCaprio", "Joseph Gordon-Levitt", "Elliot Page"],
    trailerKey: "YoHD9XEInc0",
    mediaType: "movie",
    providers: [{ name: "Netflix", logoPath: "/t2yyOv40HZeVlLjYsCsPHnWLk4W.jpg" }],
  },
  {
    id: 157336,
    title: "Interstellar",
    year: "2014",
    rating: 8.4,
    posterPath: "/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg",
    overview:
      "A team of explorers travel through a wormhole in space in an attempt to ensure humanity's survival.",
    genres: ["Adventure", "Drama", "Sci-Fi"],
    cast: ["Matthew McConaughey", "Anne Hathaway", "Jessica Chastain"],
    trailerKey: "zSWdZVtXT7E",
    mediaType: "movie",
    providers: [{ name: "Prime Video", logoPath: "/68MNrwlkpF7WnmNPXLah69CR5cb.jpg" }],
  },
  {
    id: 155,
    title: "The Dark Knight",
    year: "2008",
    rating: 8.5,
    posterPath: "/qJ2tW6WMUDux911r6m7haRef0WH.jpg",
    overview:
      "Batman raises the stakes in his war on crime with the help of Lt. Jim Gordon and DA Harvey Dent, but a rising criminal known as the Joker plunges Gotham into anarchy.",
    genres: ["Action", "Crime", "Drama"],
    cast: ["Christian Bale", "Heath Ledger", "Aaron Eckhart"],
    trailerKey: "EXeTwQWrcwY",
    mediaType: "movie",
  },
  {
    id: 19404,
    title: "Dilwale Dulhania Le Jayenge",
    year: "1995",
    rating: 8.6,
    posterPath: "/2CAL2433ZeIihfX1Hb2139CX0pW.jpg",
    overview:
      "Raj and Simran, two young NRIs, fall in love during a trip across Europe, but her father has already promised her hand in marriage.",
    genres: ["Comedy", "Drama", "Romance"],
    cast: ["Shah Rukh Khan", "Kajol", "Amrish Puri"],
    mediaType: "movie",
  },
  {
    id: 24428,
    title: "The Avengers",
    year: "2012",
    rating: 7.7,
    posterPath: "/RYMX2wcKCBAr24UyPD7xwmjaTn.jpg",
    overview:
      "Earth's mightiest heroes must come together and learn to fight as a team to stop the mischievous Loki and his alien army.",
    genres: ["Action", "Adventure", "Sci-Fi"],
    cast: ["Robert Downey Jr.", "Chris Evans", "Scarlett Johansson"],
    mediaType: "movie",
  },
  {
    id: 13,
    title: "Forrest Gump",
    year: "1994",
    rating: 8.5,
    posterPath: "/arw2vcBveWOVZr6pxd9XTd1TdQa.jpg",
    overview:
      "A man with a low IQ has accomplished great things in his life and been present during significant historic events.",
    genres: ["Comedy", "Drama", "Romance"],
    cast: ["Tom Hanks", "Robin Wright", "Gary Sinise"],
    mediaType: "movie",
  },
  {
    id: 680,
    title: "Pulp Fiction",
    year: "1994",
    rating: 8.5,
    posterPath: "/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg",
    overview:
      "A burger-loving hit man, his philosophical partner and a washed-up boxer converge in this sprawling crime caper.",
    genres: ["Thriller", "Crime"],
    cast: ["John Travolta", "Samuel L. Jackson", "Uma Thurman"],
    mediaType: "movie",
  },
  {
    id: 603,
    title: "The Matrix",
    year: "1999",
    rating: 8.2,
    posterPath: "/p96dm7sCMn4VYAStA6siNz30G1r.jpg",
    overview:
      "A computer hacker learns the true nature of his reality and his role in the war against its controllers.",
    genres: ["Action", "Sci-Fi"],
    cast: ["Keanu Reeves", "Laurence Fishburne", "Carrie-Anne Moss"],
    mediaType: "movie",
  },
  {
    id: 12477,
    title: "Grave of the Fireflies",
    year: "1988",
    rating: 8.5,
    posterPath: "/4UvIyHl5Hzu7gxOlvDbHwIq6lz5.jpg",
    overview:
      "A young boy and his little sister struggle to survive in Japan during World War II.",
    genres: ["Animation", "Drama", "War"],
    cast: ["Tsutomu Tatsumi", "Ayano Shiraishi"],
    mediaType: "movie",
  },
  {
    id: 122,
    title: "The Lord of the Rings: Return of the King",
    year: "2003",
    rating: 8.5,
    posterPath: "/rCzpDGLbOoPwLjy3OAm5NUPOTrC.jpg",
    overview:
      "Aragorn is revealed as the heir to the ancient kings as he, Gandalf and the other members of the broken fellowship struggle to save Gondor.",
    genres: ["Adventure", "Fantasy", "Action"],
    cast: ["Elijah Wood", "Viggo Mortensen", "Ian McKellen"],
    mediaType: "movie",
  },
];

// The 3 inline picks the AI surfaces after collecting context.
export const MOCK_RECOMMENDATIONS: Movie[] = [
  MOCK_MOVIES[1], // Interstellar
  MOCK_MOVIES[8], // Grave of the Fireflies
  MOCK_MOVIES[5], // Forrest Gump
];

// Seed conversation for the chat drawer shell, ending in a rec message.
export const MOCK_MESSAGES: ChatMessage[] = [
  {
    id: "m1",
    role: "assistant",
    content:
      "Hey Emi! 🎬 So good to see you. How are you feeling tonight — what kind of mood are you in for a watch?",
  },
  {
    id: "m2",
    role: "user",
    content: "Honestly a bit tired and emotional, want something that makes me feel something.",
  },
  {
    id: "m3",
    role: "assistant",
    content:
      "I hear you, Emi ❤️ Those nights call for something that holds you gently. Are you watching alone, and how much time do you have tonight?",
  },
  {
    id: "m4",
    role: "user",
    content: "Alone, and I've got about two hours.",
  },
  {
    id: "m5",
    role: "assistant",
    content:
      "Perfect. Based on that tender, reflective mood you're in, here are three I think will land just right for you tonight 👇",
    recommendations: MOCK_RECOMMENDATIONS,
  },
];

export const MOCK_SESSIONS: ChatSessionSummary[] = [
  { id: "s1", title: "Something emotional for tonight", timeAgo: "2h ago" },
  { id: "s2", title: "Action movies like John Wick", timeAgo: "Yesterday" },
  { id: "s3", title: "Best sci-fi of the last decade", timeAgo: "3 days ago" },
];

export const MOCK_USER = {
  fullName: "Emi Austin",
  displayName: "Emi",
  avatarUrl: "", // falls back to gradient initial
  joined: "June 2026",
  isPremium: false,
  topGenres: ["Sci-Fi", "Drama", "Thriller"],
  stats: { discussed: 12, watchlist: 5, chats: 8 },
};
