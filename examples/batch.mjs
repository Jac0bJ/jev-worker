// JEV_WORKER_URL=http://localhost:8787 JEV_CLIENT_API_KEY=... node examples/batch.mjs
const base = (process.env.JEV_WORKER_URL || "http://localhost:8787").replace(
  /\/$/,
  "",
);
const key = process.env.JEV_CLIENT_API_KEY;
if (!key) {
  console.error(
    "Set JEV_CLIENT_API_KEY to a configured CLIENT_API_KEYS value.",
  );
  process.exitCode = 1;
} else {
  const items = [
    {
      state: "Please contact me about pricing for a team of twelve.",
      questions: {
        sales: {
          type: "noul",
          instructions: "Is this a genuine sales inquiry?",
          criteria: {
            true: "A real request about buying or evaluating the product.",
            false: "Spam, unrelated content, or an empty request.",
          },
        },
      },
    },
    {
      state: "My invoice shows an unexpected charge.",
      questions: {
        department: {
          type: "choice",
          instructions: "Which team should handle this request?",
          criteria: {
            billing: "Payments and invoices",
            support: "Product problems",
            other: null,
          },
        },
      },
    },
  ];
  try {
    const response = await fetch(`${base}/decide/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": key },
      body: JSON.stringify(items),
    });
    const payload = await response.json();
    console.log(
      JSON.stringify(
        {
          status: response.status,
          cache: response.headers.get("X-Cache"),
          ...payload,
        },
        null,
        2,
      ),
    );
    if (!response.ok || payload.results?.some((item) => item.status >= 400))
      process.exitCode = 1;
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
