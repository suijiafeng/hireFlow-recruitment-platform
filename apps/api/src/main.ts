import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  // 临时排查：记录所有写请求的来源（定位 stray PATCH 问题后可移除）
  app.use((req: { method: string; url: string; headers: Record<string, string> }, _res: unknown, next: () => void) => {
    if (req.method !== 'GET' && req.method !== 'OPTIONS') {
      console.log(
        `[REQ] ${new Date().toISOString()} ${req.method} ${req.url} ua="${req.headers['user-agent']?.slice(0, 40)}" referer="${req.headers.referer ?? '-'}"`,
      );
    }
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.enableCors({ origin: true, credentials: true });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('HireFlow API')
    .setDescription('智能招聘 AI 辅助平台后端接口')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`HireFlow API 已启动: http://localhost:${port}/api  文档: http://localhost:${port}/api/docs`);
}

void bootstrap();
