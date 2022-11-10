import dotenv from "dotenv";
dotenv.config({ silent: process.env.NODE_ENV === 'production' });

module.exports = {
	JENA_HOST: (process.env.JENA_HOST || "localhost"),
	JENA_PORT: (process.env.JENA_PORT || "3030"),
	PROLOG_HOST: (process.env.PROLOG_HOST || "localhost"),
	PROLOG_PORT: (process.env.PROLOG_PORT || "1234"),
	INSERT: "INSERT",
	DELETE: "DELETE",
	FUSEKI_PASSWORD: (process.env.FUSEKI_PASSWORD || "road2h"),
	PORT: (process.env.PORT || "8888")
};