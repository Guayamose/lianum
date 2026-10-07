/** Manual local-client routes; no background work or permission issuance. */
export const WRAPPED_RESUME_ACTIONS=Object.freeze({
 wrappedWithdrawSuccessorReview:Object.freeze({title:'Revisar consentimiento sucesor',capability:'wrappedWithdrawSuccessorReview',route:'/api/wallet/wrapped-withdrawal/successor-review',method:'reviewOriginalResumeSuccessor'}),
 wrappedWithdrawSuccessorAdmit:Object.freeze({title:'Autorizar consentimiento sucesor',capability:'wrappedWithdrawSuccessorAdmit',route:'/api/wallet/wrapped-withdrawal/successor-admit',method:'admitOriginalResumeSuccessor'}),
 wrappedWithdrawResumeReview:Object.freeze({title:'Revisar recuperación original',capability:'wrappedWithdrawResumeReview',route:'/api/wallet/wrapped-withdrawal/resume-review',method:'reviewOriginalResume'}),
 wrappedWithdrawResumeAdmit:Object.freeze({title:'Autorizar recuperación original',capability:'wrappedWithdrawResumeAdmit',route:'/api/wallet/wrapped-withdrawal/resume-admit',method:'admitOriginalResume'}),
 wrappedWithdrawResumeContinue:Object.freeze({title:'Continuar recuperación original',capability:'wrappedWithdrawResumeContinue',route:'/api/wallet/wrapped-withdrawal/resume-continue',method:'continueOriginalResume'}),
});
export const isWrappedResumeAction=action=>Object.hasOwn(WRAPPED_RESUME_ACTIONS,action);
