import { AppController } from './app.controller';

describe('AppController', () => {
  it('health 返回 ok', () => {
    const controller = new AppController();
    const result = controller.health();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('hireflow-api');
  });
});
