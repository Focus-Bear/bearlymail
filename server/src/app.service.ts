import { Injectable } from "@nestjs/common";

@Injectable()
export class AppService {
  getHello(): string {
    return "ADHD-Friendly Email Client API v1.1";
  }
}
