import { Injectable } from "@nestjs/common";
import bcrypt from "bcryptjs";

const passwordCost = 12;

@Injectable()
export class PasswordService {
  hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, passwordCost);
  }

  verifyPassword(password: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(password, passwordHash);
  }
}
