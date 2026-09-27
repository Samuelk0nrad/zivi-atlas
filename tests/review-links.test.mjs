import test from 'node:test';
import assert from 'node:assert/strict';
import {withReviewLinks} from '../lib/review-links.ts';
import {draftLinks} from '../lib/draft-contract.ts';

test('review links follow the active deployment while mail composers keep their destination',()=>{
  const draft={id:'example-id',recipient:'office@example.org',subject:'Anfrage',body:'Guten Tag'};
  const links={...draftLinks(draft),applicationUrl:'/?application=example-application'};
  for(const origin of ['http://localhost:5173','https://zivi.example.org']){
    const result=withReviewLinks(links,origin+'/api/mcp');
    assert.equal(result.draftUrl,origin+'/?draft=example-id');
    assert.equal(result.exportUrl,origin+'/api/drafts/example-id/export');
    assert.equal(result.applicationUrl,origin+'/?application=example-application');
    assert.equal(result.gmailUrl,links.gmailUrl);
    assert.equal(result.mailtoUrl,links.mailtoUrl);
  }
  assert.equal(links.draftUrl,'/?draft=example-id');
});
