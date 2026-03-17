'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add activity tracking fields to users table
    await queryInterface.addColumn('users', 'last_message_date', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Date of user\'s last message in the group'
    });

    await queryInterface.addColumn('users', 'last_reaction_date', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Date of user\'s last reaction in the group'
    });

    await queryInterface.addColumn('users', 'last_bot_activity_date', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Date of user\'s last activity in the bot (event creation/participation)'
    });

    await queryInterface.addColumn('users', 'is_active', {
      type: Sequelize.BOOLEAN,
      defaultValue: true,
      allowNull: false,
      comment: 'Whether user is considered active based on recent activity'
    });

    await queryInterface.addColumn('users', 'is_exempt_from_activity_check', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false,
      comment: 'Whether user is exempt from activity monitoring'
    });

    // Add index for performance
    await queryInterface.addIndex('users', ['is_active'], {
      name: 'idx_users_is_active'
    });

    await queryInterface.addIndex('users', ['is_exempt_from_activity_check'], {
      name: 'idx_users_is_exempt'
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove indexes first
    await queryInterface.removeIndex('users', 'idx_users_is_active');
    await queryInterface.removeIndex('users', 'idx_users_is_exempt');

    // Remove columns
    await queryInterface.removeColumn('users', 'last_message_date');
    await queryInterface.removeColumn('users', 'last_reaction_date');
    await queryInterface.removeColumn('users', 'last_bot_activity_date');
    await queryInterface.removeColumn('users', 'is_active');
    await queryInterface.removeColumn('users', 'is_exempt_from_activity_check');
  }
};