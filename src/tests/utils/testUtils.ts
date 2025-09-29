// Mock response helper
export const createMockResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

// Mock request helper
export const createMockRequest = (dataOverrides = {}) => ({
  body: {},
  params: {},
  query: {},
  headers: {},
  method: 'GET',
  originalUrl: '/test',
  ip: '127.0.0.1',
  ...dataOverrides
});