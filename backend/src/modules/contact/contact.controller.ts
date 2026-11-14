import { Body, Controller, Post } from '@nestjs/common';
import { ContactService } from './contact.service';
import { CreateMessageDto } from './dto/create-message.dto';

/** Routes : POST /api/contact */
@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post()
  create(@Body() dto: CreateMessageDto) {
    return this.contactService.create(dto);
  }
}
