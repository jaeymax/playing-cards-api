import request from 'supertest';
import {describe, it , expect} from '@jest/globals'


describe('hello', ()=>{
    it('hey', ()=>{
        expect('hello world').toBeTruthy();
    })
})
