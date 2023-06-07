// https://docs.cypress.io/api/introduction/api.html

describe('Button', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('checks for buttons and button text', () => {
    cy.contains('h2[data-cy=buttons]', 'Buttons');

    cy.get('button[class*=_primary]').first().as('primaryButton');
    cy.get('button[class*=_secondary]').first().as('secondaryButton');
    cy.get('button[disabled]').first().as('disabledButton');

    // prefix button
    cy.get('button > svg.remixicon + span')
      .first()
      .parent('button')
      .as('prefixedButton');

    // suffix button
    cy.get('button > span + svg.remixicon')
      .first()
      .parent('button')
      .as('suffixedButton');

    // primary buttons should be clickable
    cy.get('@primaryButton').click();
    cy.get('@primaryButton').contains('1');
    cy.get('@primaryButton').dblclick();
    cy.get('@primaryButton').contains('3');
    cy.get('@primaryButton').find('span[class*=_label]');

    // disabled buttons not emit click
    cy.get('@disabledButton').click({ force: true });
    cy.get('@disabledButton').dblclick({ force: true });
    cy.get('@disabledButton').contains('0');
  });
});
