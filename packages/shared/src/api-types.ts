export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
};

export type HealthResponse = {
  status: "ok";
  environment: string;
};
