CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  username VARCHAR(50) UNIQUE,
  full_name VARCHAR(100),
  phone VARCHAR(20),
  profile_picture VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE locations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  address VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE games (
  id SERIAL PRIMARY KEY,
  created_by INT REFERENCES users(id),
  title VARCHAR(100) NOT NULL,
  description TEXT,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  location_id INT REFERENCES locations(id),
  max_players INT NOT NULL DEFAULT 10,
  min_players INT NOT NULL DEFAULT 2,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  price DECIMAL(10, 2),
  skill_level VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE participants (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) NOT NULL,
  game_id INT REFERENCES games(id) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'confirmed',
  joined_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, game_id)
);

CREATE TABLE ratings (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) NOT NULL,
  game_id INT REFERENCES games(id) NOT NULL,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, game_id)
); 